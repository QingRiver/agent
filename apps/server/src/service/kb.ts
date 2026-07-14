import type { KbChunk } from '@agent/kb'
import type { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from '@agent/env'
import {
  chunkMarkdown,
  cleanMarkdown,
  deleteByPointIds,
  embedAndUpsert,
  enrichDocument,
  hashContent,
  loadDocumentMarkdown,
  retrieveAndRerank,
  setPayloadByDocId,
} from '@agent/kb'
import { and, desc, eq, isNull, not, or, sql } from 'drizzle-orm'
import { db } from '../db/drizzle'
import { kbChunks, kbDocuments, kbNodes } from '../db/schema'

const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.docx', '.pdf', '.html', '.htm', '.txt'])
/** ingestFromPath 相对起点最多下钻的子目录层数（根目录本身为第 0 层） */
const INGEST_PATH_MAX_DEPTH = 5

export class KbConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KbConflictError'
  }
}

export type KbIndexingStatus = 'draft' | 'indexing' | 'completed' | 'error'

export interface KbNodeRow {
  id: string
  kbId: string
  parentId: string | null
  name: string
  owner: string | null
  visibility: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface KbDocSummary {
  id: string
  kbId: string
  parentNodeId: string | null
  name: string
  filename: string | null
  vdir: string | null
  tags: string[]
  owner: string | null
  summary: string | null
  keywords: string[]
  toc: string[]
  visibility: string
  pinned: boolean
  indexingStatus: KbIndexingStatus
  error: string | null
  draftHash: string | null
  publishedHash: string | null
  createdAt: number
  updatedAt: number
  indexedAt: number | null
}

export interface KbDoc extends KbDocSummary {
  content: string
  permissions: Record<string, unknown>
}

export interface KbIngestFile {
  buffer: Buffer
  filename: string
}

export interface KbIngestResultItem {
  docId: string
  name: string
  vdir: string | null
  skipped: boolean
}

// ---------- 工具 ----------

function now(): number {
  return Date.now()
}

/** pg 唯一约束冲突（含 23505）。drizzle 把底层错误包在 cause 里。 */
function isUniqueViolation(err: unknown): boolean {
  const any = err as { code?: string, cause?: { code?: string } }
  return any?.code === '23505' || any?.cause?.code === '23505'
}

/**
 * 规范化相对路径段：丢弃 `.` 与空段；遇 `..`（逃逸 base）抛错。
 * `./aaa` 经 path.resolve 已干净，此处防 `..` 逃逸与脏段。
 */
function sanitizePathSegments(segments: string[]): string[] {
  const clean: string[] = []
  for (const seg of segments) {
    if (seg === '' || seg === '.')
      continue
    if (seg === '..')
      throw new KbConflictError(`relative path escapes base directory: ${segments.join('/')}`)
    clean.push(seg)
  }
  return clean
}

function nodeRow(row: typeof kbNodes.$inferSelect): KbNodeRow {
  return {
    id: row.id,
    kbId: row.kbId,
    parentId: row.parentId,
    name: row.name,
    owner: row.owner,
    visibility: row.visibility,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function docSummary(row: typeof kbDocuments.$inferSelect): KbDocSummary {
  return {
    id: row.id,
    kbId: row.kbId,
    parentNodeId: row.parentNodeId,
    name: row.name,
    filename: row.filename,
    vdir: row.vdir,
    tags: row.tags ?? [],
    owner: row.owner,
    summary: row.summary,
    keywords: row.keywords ?? [],
    toc: row.toc ?? [],
    visibility: row.visibility,
    pinned: row.pinned,
    indexingStatus: row.indexingStatus as KbIndexingStatus,
    error: row.error,
    draftHash: row.draftHash,
    publishedHash: row.publishedHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    indexedAt: row.indexedAt,
  }
}

function docFull(row: typeof kbDocuments.$inferSelect): KbDoc {
  return { ...docSummary(row), content: row.content, permissions: (row.permissions ?? {}) as Record<string, unknown> }
}

/**
 * 由父链 walk 派生 vdir。nodesMap 为该 kb 全部文件夹（id→row）。
 * 根级文档（parentId=null）→ vdir = name。
 */
function computeVdir(parentId: string | null, name: string, nodesMap: Map<string, typeof kbNodes.$inferSelect>): string {
  const segments: string[] = []
  const guard = new Set<string>()
  let cur = parentId
  while (cur != null && !guard.has(cur)) {
    guard.add(cur)
    const node = nodesMap.get(cur)
    if (!node)
      break
    segments.unshift(node.name)
    cur = node.parentId
  }
  segments.push(name)
  return segments.join('/')
}

// ---------- kb_id 解析 ----------

export class KbService {
  static resolveKbId(kbId?: string): string {
    return kbId?.trim() || env.KB_COLLECTION
  }

  // ---------- 文件夹树 ----------

  static async listNodes(kbId: string, owner?: string): Promise<KbNodeRow[]> {
    const rows = await db
      .select()
      .from(kbNodes)
      .where(and(eq(kbNodes.kbId, kbId), ...(owner != null ? [eq(kbNodes.owner, owner)] : [])))
      .orderBy(kbNodes.sortOrder, kbNodes.name)
    return rows.map(nodeRow)
  }

  static async getNode(id: string): Promise<KbNodeRow | null> {
    const rows = await db.select().from(kbNodes).where(eq(kbNodes.id, id)).limit(1)
    return rows[0] ? nodeRow(rows[0]) : null
  }

  static async createFolder(args: {
    kbId: string
    parentId?: string | null
    name: string
    owner?: string
  }): Promise<KbNodeRow> {
    const id = randomUUID()
    const ts = now()
    await db.insert(kbNodes).values({
      id,
      kbId: args.kbId,
      parentId: args.parentId ?? null,
      name: args.name,
      owner: args.owner ?? null,
      visibility: 'private',
      permissions: {},
      sortOrder: 0,
      createdAt: ts,
      updatedAt: ts,
    })
    const row = await KbService.getNode(id)
    return row!
  }

  /**
   * 重命名/移动文件夹（可同时改 name + parentId），一次 vdir 重算 + Qdrant setPayload。
   * newParentId 若为自身或其后代 → KbConflictError。
   */
  static async updateFolder(args: {
    kbId: string
    nodeId: string
    name?: string
    parentId?: string | null
  }): Promise<KbNodeRow | null> {
    const { kbId, nodeId } = args
    if (args.parentId !== undefined)
      await KbService.assertNoFolderCycle(kbId, nodeId, args.parentId)

    const ts = now()
    let updated: (typeof kbNodes.$inferSelect)[]
    try {
      updated = await db
        .update(kbNodes)
        .set({
          updatedAt: ts,
          ...(args.name != null ? { name: args.name } : {}),
          ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
        })
        .where(and(eq(kbNodes.id, nodeId), eq(kbNodes.kbId, kbId)))
        .returning()
    }
    catch (err) {
      // uniq_kb_nodes_parent_name (kb_id, parent_id, name) 冲突 → 同级重名
      if (isUniqueViolation(err))
        throw new KbConflictError('a folder with the same name already exists at the target location')
      throw err
    }
    if (!updated[0])
      return null
    await KbService.recomputeAllVdirs(kbId)
    return nodeRow(updated[0])
  }

  static async renameNode(kbId: string, nodeId: string, name: string): Promise<KbNodeRow | null> {
    return KbService.updateFolder({ kbId, nodeId, name })
  }

  static async moveNode(kbId: string, nodeId: string, newParentId: string | null): Promise<KbNodeRow | null> {
    return KbService.updateFolder({ kbId, nodeId, parentId: newParentId })
  }

  static async deleteFolder(kbId: string, nodeId: string): Promise<boolean> {
    // 级联删子文件夹；其下文档 parent_node_id 被 SET NULL（变根级），重算 vdir + Qdrant。
    const deleted = await db
      .delete(kbNodes)
      .where(and(eq(kbNodes.id, nodeId), eq(kbNodes.kbId, kbId)))
      .returning({ id: kbNodes.id })
    if (!deleted.length)
      return false
    await KbService.recomputeAllVdirs(kbId)
    return true
  }

  /** newParentId 不能是 nodeId 自身或其任意后代。 */
  private static async assertNoFolderCycle(kbId: string, nodeId: string, newParentId: string | null): Promise<void> {
    if (newParentId == null)
      return
    if (newParentId === nodeId)
      throw new KbConflictError('cannot move folder under itself')
    const nodes = await db.select({ id: kbNodes.id, parentId: kbNodes.parentId }).from(kbNodes).where(eq(kbNodes.kbId, kbId))
    const parentOf = new Map(nodes.map(n => [n.id, n.parentId]))
    let cur: string | null = newParentId
    const guard = new Set<string>()
    while (cur != null && !guard.has(cur)) {
      if (cur === nodeId)
        throw new KbConflictError('cannot move folder under its descendant')
      guard.add(cur)
      cur = parentOf.get(cur) ?? null
    }
  }

  /**
   * 沿相对路径段 find-or-create 文件夹链，返回末位文件夹 id。
   * 相对路径 → node id 映射的核心预处理。
   */
  static async ensureNodePath(args: {
    kbId: string
    segments: string[]
    owner?: string
  }): Promise<string | null> {
    const { kbId, segments, owner } = args
    let parentId: string | null = null
    for (const seg of segments) {
      if (!seg || seg === '.')
        continue
      if (seg === '..')
        throw new KbConflictError(`invalid folder segment '..' (path escape not allowed)`)
      const existing = await db
        .select()
        .from(kbNodes)
        .where(and(eq(kbNodes.kbId, kbId), parentId == null ? isNull(kbNodes.parentId) : eq(kbNodes.parentId, parentId), eq(kbNodes.name, seg)))
        .limit(1)
      if (existing[0]) {
        parentId = existing[0].id
        continue
      }
      const created = await KbService.createFolder({ kbId, parentId, name: seg, ...(owner != null ? { owner } : {}) })
      parentId = created.id
    }
    return parentId
  }

  // ---------- vdir 重算 ----------

  /** 重算单个文档的 vdir 缓存（parent/name 变更时）。 */
  static async recomputeVdir(docId: string): Promise<string | null> {
    const doc = await db.select().from(kbDocuments).where(eq(kbDocuments.id, docId)).limit(1)
    if (!doc[0])
      return null
    const nodes = await db.select().from(kbNodes).where(eq(kbNodes.kbId, doc[0].kbId))
    const nodesMap = new Map(nodes.map(n => [n.id, n]))
    const vdir = computeVdir(doc[0].parentNodeId, doc[0].name, nodesMap)
    await db.update(kbDocuments).set({ vdir }).where(eq(kbDocuments.id, docId))
    return vdir
  }

  /**
   * 重算整个 kb 所有文档的 vdir 缓存（文件夹结构性变更时），
   * 并对已提交文档同步 Qdrant payload.vdir（不重 embed）。
   */
  static async recomputeAllVdirs(kbId: string): Promise<void> {
    const nodes = await db.select().from(kbNodes).where(eq(kbNodes.kbId, kbId))
    const nodesMap = new Map(nodes.map(n => [n.id, n]))
    const docs = await db.select({
      id: kbDocuments.id,
      parentNodeId: kbDocuments.parentNodeId,
      name: kbDocuments.name,
      indexingStatus: kbDocuments.indexingStatus,
    }).from(kbDocuments).where(eq(kbDocuments.kbId, kbId))
    if (!docs.length)
      return
    const next = docs.map(d => ({
      id: d.id,
      vdir: computeVdir(d.parentNodeId, d.name, nodesMap),
      indexingStatus: d.indexingStatus,
    }))
    // 只更新 vdir 缓存，不动 updatedAt——文件夹结构性变更不算内容编辑，否则会冲掉"最近修改"排序
    await Promise.all(next.map(d => db.update(kbDocuments).set({ vdir: d.vdir }).where(eq(kbDocuments.id, d.id))))
    await Promise.all(
      next
        .filter(d => d.indexingStatus === 'completed')
        .map(d => setPayloadByDocId(kbId, d.id, { vdir: d.vdir })),
    )
  }

  // ---------- 草稿 CRUD ----------

  static async createDraft(args: {
    kbId: string
    parentNodeId?: string | null
    name: string
    content?: string
    owner?: string
    tags?: string[]
    filename?: string
  }): Promise<KbDoc> {
    const id = randomUUID()
    const ts = now()
    const content = args.content ?? ''
    const draftHash = hashContent(content)
    const nodes = await db.select().from(kbNodes).where(eq(kbNodes.kbId, args.kbId))
    const nodesMap = new Map(nodes.map(n => [n.id, n]))
    const vdir = computeVdir(args.parentNodeId ?? null, args.name, nodesMap)

    await db.insert(kbDocuments).values({
      id,
      kbId: args.kbId,
      parentNodeId: args.parentNodeId ?? null,
      name: args.name,
      filename: args.filename ?? null,
      vdir,
      content,
      draftHash,
      publishedHash: null,
      tags: args.tags ?? [],
      owner: args.owner ?? null,
      summary: null,
      keywords: [],
      toc: [],
      visibility: 'private',
      permissions: {},
      pinned: false,
      indexingStatus: 'draft',
      error: null,
      createdAt: ts,
      updatedAt: ts,
      indexedAt: null,
    })
    const row = await db.select().from(kbDocuments).where(eq(kbDocuments.id, id)).limit(1)
    return docFull(row[0]!)
  }

  static async getDoc(id: string): Promise<KbDoc | null> {
    const rows = await db.select().from(kbDocuments).where(eq(kbDocuments.id, id)).limit(1)
    return rows[0] ? docFull(rows[0]) : null
  }

  static async listDocs(args: {
    kbId: string
    tag?: string
    owner?: string
    vdirPrefix?: string
    parentNodeId?: string | null
  }): Promise<KbDocSummary[]> {
    const conditions = [eq(kbDocuments.kbId, args.kbId)]
    if (args.owner != null)
      conditions.push(eq(kbDocuments.owner, args.owner))
    if (args.tag != null)
      conditions.push(sql`${kbDocuments.tags} @> ARRAY[${args.tag}]::text[]`)
    if (args.vdirPrefix != null) {
      const prefix = args.vdirPrefix
      // 精确前缀：vdir = prefix 或 vdir LIKE 'prefix/%'，避免 notes 命中 notes2
      conditions.push(or(eq(kbDocuments.vdir, prefix), sql`${kbDocuments.vdir} LIKE ${`${prefix}/%`}`)!)
    }
    if (args.parentNodeId !== undefined)
      conditions.push(args.parentNodeId == null ? isNull(kbDocuments.parentNodeId) : eq(kbDocuments.parentNodeId, args.parentNodeId))

    const rows = await db
      .select()
      .from(kbDocuments)
      .where(and(...conditions))
      .orderBy(desc(kbDocuments.pinned), desc(kbDocuments.updatedAt))
    return rows.map(docSummary)
  }

  static async saveDraft(id: string, patch: { content?: string, name?: string }): Promise<KbDoc | null> {
    // 内容变才标脏（completed→draft）；改名不触发重 embed 但仍记 updated_at
    const before = await db.select({ status: kbDocuments.indexingStatus }).from(kbDocuments).where(eq(kbDocuments.id, id)).limit(1)
    if (!before[0])
      return null
    if (before[0].status === 'indexing')
      throw new KbConflictError('document is already indexing')
    // 内容变才标脏：completed 或 error 都回退 draft（error 时清掉错误信息，便于重提交）
    const dirtied = patch.content != null && (before[0].status === 'completed' || before[0].status === 'error')

    const updated = await db
      .update(kbDocuments)
      .set({
        ...(patch.content != null ? { content: patch.content, draftHash: hashContent(patch.content) } : {}),
        ...(patch.name != null ? { name: patch.name } : {}),
        ...(dirtied ? { indexingStatus: 'draft' as const, error: null } : {}),
        updatedAt: now(),
      })
      .where(eq(kbDocuments.id, id))
      .returning()
    if (!updated[0])
      return null
    if (patch.name != null)
      await KbService.recomputeVdir(id)
    return docFull(updated[0])
  }

  static async updateMeta(id: string, patch: {
    tags?: string[]
    parentNodeId?: string | null
    name?: string
    owner?: string
    visibility?: string
    pinned?: boolean
  }): Promise<KbDoc | null> {
    const updated = await db
      .update(kbDocuments)
      .set({
        updatedAt: now(),
        ...(patch.tags != null ? { tags: patch.tags } : {}),
        ...(patch.parentNodeId !== undefined ? { parentNodeId: patch.parentNodeId } : {}),
        ...(patch.name != null ? { name: patch.name } : {}),
        ...(patch.owner !== undefined ? { owner: patch.owner } : {}),
        ...(patch.visibility != null ? { visibility: patch.visibility } : {}),
        ...(patch.pinned != null ? { pinned: patch.pinned } : {}),
      })
      .where(eq(kbDocuments.id, id))
      .returning()
    if (!updated[0])
      return null

    let row = updated[0]
    // 位置/名称变 → 重算 vdir + Qdrant setPayload 同步（不重 embed）
    if (patch.parentNodeId !== undefined || patch.name != null) {
      const vdir = await KbService.recomputeVdir(id)
      if (vdir != null)
        row = { ...row, vdir }
      if (row.indexingStatus === 'completed')
        await setPayloadByDocId(row.kbId, id, { vdir: row.vdir })
    }
    if (patch.tags != null && row.indexingStatus === 'completed')
      await setPayloadByDocId(row.kbId, id, { tags: patch.tags })

    return docFull(row)
  }

  static async removeDoc(id: string): Promise<boolean> {
    // 先取 chunk point ids，删 Qdrant；再删 PG 行（级联删 kb_chunks）。
    const doc = await db.select({ kbId: kbDocuments.kbId }).from(kbDocuments).where(eq(kbDocuments.id, id)).limit(1)
    if (!doc[0])
      return false
    const chunks = await db.select({ id: kbChunks.id }).from(kbChunks).where(eq(kbChunks.docId, id))
    if (chunks.length)
      await deleteByPointIds(doc[0].kbId, chunks.map(c => c.id))
    const deleted = await db.delete(kbDocuments).where(eq(kbDocuments.id, id)).returning({ id: kbDocuments.id })
    return deleted.length > 0
  }

  static async listTags(kbId: string, owner?: string): Promise<string[]> {
    const res = owner != null
      ? await db.execute<{ tag: string }>(sql`
          SELECT DISTINCT tag FROM (
            SELECT UNNEST(tags) AS tag FROM kb_documents WHERE kb_id = ${kbId} AND owner = ${owner}
          ) t WHERE tag IS NOT NULL ORDER BY tag
        `)
      : await db.execute<{ tag: string }>(sql`
          SELECT DISTINCT tag FROM (
            SELECT UNNEST(tags) AS tag FROM kb_documents WHERE kb_id = ${kbId}
          ) t WHERE tag IS NOT NULL ORDER BY tag
        `)
    return (res.rows ?? []).map(r => r.tag)
  }

  // ---------- 提交（异步预处理，整文档重建） ----------

  /**
   * 提交草稿：chunk + enrich + embed + Qdrant 重建。
   * status:indexing 期间拒绝重复提交（KbConflictError）；失败置 error。
   * opts.skipEnrich 跳过 LLM enrich（测试/离线用）。
   */
  static async commit(id: string, opts: { skipEnrich?: boolean } = {}): Promise<KbDoc> {
    const ts = now()
    const claimed = await db
      .update(kbDocuments)
      .set({ indexingStatus: 'indexing', error: null, updatedAt: ts })
      .where(and(eq(kbDocuments.id, id), not(eq(kbDocuments.indexingStatus, 'indexing'))))
      .returning()
    if (!claimed[0])
      throw new KbConflictError('document is already indexing')

    try {
      await KbService.runCommit(claimed[0], opts.skipEnrich ?? false)
      const row = await db.select().from(kbDocuments).where(eq(kbDocuments.id, id)).limit(1)
      return docFull(row[0]!)
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db.update(kbDocuments).set({ indexingStatus: 'error', error: message, updatedAt: now() }).where(eq(kbDocuments.id, id))
      throw err
    }
  }

  static async commitBatch(ids: string[], opts: { skipEnrich?: boolean } = {}): Promise<void> {
    for (const id of ids)
      await KbService.commit(id, opts)
  }

  private static async runCommit(doc: typeof kbDocuments.$inferSelect, skipEnrich: boolean): Promise<void> {
    const kbId = doc.kbId
    const id = doc.id
    const content = doc.content

    // 1. clean + chunk
    const cleaned = cleanMarkdown(content, { sourceDocId: id, ...(doc.vdir ? { baseUrl: doc.vdir } : {}) })
    const chunks: KbChunk[] = chunkMarkdown(cleaned, { sourceDocId: id })
    const pointIds = chunks.map(() => randomUUID())

    // 2. enrich（可选）
    const tags = doc.tags ?? []
    let summary: string | null = null
    let keywords: string[] = []
    let toc: string[] = []
    if (!skipEnrich && content.trim()) {
      const enriched = await enrichDocument({
        source_doc_id: id,
        filename: doc.filename ?? doc.name,
        content_hash: doc.draftHash ?? '',
        markdown: cleaned,
        ...(tags.length ? { tags } : {}),
        ...(doc.vdir ? { vdir: doc.vdir } : {}),
        ...(doc.owner ? { owner: doc.owner } : {}),
      })
      summary = enriched.summary ?? null
      keywords = enriched.keywords
      toc = enriched.toc
    }

    // 3. 删旧 chunk：Qdrant delete_by_point_ids + PG 行
    const oldChunks = await db.select({ id: kbChunks.id }).from(kbChunks).where(eq(kbChunks.docId, id))
    if (oldChunks.length)
      await deleteByPointIds(kbId, oldChunks.map(c => c.id))
    await db.delete(kbChunks).where(eq(kbChunks.docId, id))

    // 4. embed + upsert（point id = chunk uuid，payload 含当前 vdir/owner/tags）
    if (chunks.length) {
      await embedAndUpsert({
        kbId,
        docId: id,
        ...(doc.vdir != null ? { vdir: doc.vdir } : {}),
        ...(doc.owner != null ? { owner: doc.owner } : {}),
        ...(tags.length ? { tags } : {}),
        chunks,
        pointIds,
      })
    }

    // 5. 写新 kb_chunks 行
    const ct = now()
    if (chunks.length) {
      await db.insert(kbChunks).values(
        chunks.map((chunk, i) => ({
          id: pointIds[i]!,
          docId: id,
          position: i,
          content: chunk.raw_text,
          contentHash: null,
          headingPath: chunk.heading_path,
          pageNumber: chunk.page_number ?? null,
          enabled: true,
          createdAt: ct,
        })),
      )
    }

    // 6. 更新 doc 元数据
    await db.update(kbDocuments).set({
      summary,
      keywords,
      toc,
      publishedHash: doc.draftHash,
      indexedAt: ct,
      indexingStatus: 'completed',
      error: null,
      updatedAt: ct,
    }).where(eq(kbDocuments.id, id))
  }

  // ---------- 引入（markitdown → 草稿，不自动提交） ----------

  static async ingestFiles(args: {
    kbId: string
    files: KbIngestFile[]
    parentNodeId?: string | null
    owner?: string
    tags?: string[]
  }): Promise<KbIngestResultItem[]> {
    const results: KbIngestResultItem[] = []
    for (const file of args.files) {
      const markdown = await loadDocumentMarkdown(file.buffer, file.filename)
      const cleaned = cleanMarkdown(markdown, { sourceDocId: 'pending', ...(args.parentNodeId ? {} : {}) })
      const draftHash = hashContent(cleaned)
      const name = path.parse(file.filename).name

      // 去重：同 parent+name 已存在
      const existing = await db
        .select()
        .from(kbDocuments)
        .where(and(eq(kbDocuments.kbId, args.kbId), eq(kbDocuments.name, name), args.parentNodeId == null ? isNull(kbDocuments.parentNodeId) : eq(kbDocuments.parentNodeId, args.parentNodeId)))
        .limit(1)

      if (existing[0]) {
        if (existing[0].draftHash === draftHash) {
          results.push({ docId: existing[0].id, name, vdir: existing[0].vdir, skipped: true })
          continue
        }
        // 内容变了：更新草稿，回退 status
        await db.update(kbDocuments).set({
          content: cleaned,
          draftHash,
          filename: file.filename,
          indexingStatus: existing[0].indexingStatus === 'completed' ? 'draft' : existing[0].indexingStatus,
          updatedAt: now(),
        }).where(eq(kbDocuments.id, existing[0].id))
        results.push({ docId: existing[0].id, name, vdir: existing[0].vdir, skipped: false })
        continue
      }

      const doc = await KbService.createDraft({
        kbId: args.kbId,
        ...(args.parentNodeId != null ? { parentNodeId: args.parentNodeId } : {}),
        name,
        content: cleaned,
        ...(args.owner != null ? { owner: args.owner } : {}),
        ...(args.tags ? { tags: args.tags } : {}),
        filename: file.filename,
      })
      results.push({ docId: doc.id, name, vdir: doc.vdir, skipped: false })
    }
    return results
  }

  /**
   * 从服务端本地目录导入草稿。相对 base 递归最多 {@link INGEST_PATH_MAX_DEPTH} 层子目录。
   */
  static async ingestFromPath(args: {
    kbId: string
    serverPath: string
    base?: string
    owner?: string
    tags?: string[]
  }): Promise<KbIngestResultItem[]> {
    const resolved = path.resolve(args.serverPath)
    const base = args.base ? path.resolve(args.base) : resolved
    const results: KbIngestResultItem[] = []

    async function walk(dir: string, depth: number): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (depth < INGEST_PATH_MAX_DEPTH)
            await walk(full, depth + 1)
          continue
        }
        if (!entry.isFile())
          continue
        const ext = path.extname(entry.name).toLowerCase()
        if (!SUPPORTED_EXTENSIONS.has(ext))
          continue

        const buffer = await readFile(full)
        const rel = path.relative(base, full)
        const segments = sanitizePathSegments(rel.split(path.sep))
        const folderSegments = segments.slice(0, -1)
        const parentNodeId = folderSegments.length
          ? (await KbService.ensureNodePath({ kbId: args.kbId, segments: folderSegments, ...(args.owner != null ? { owner: args.owner } : {}) })) ?? null
          : null

        const items = await KbService.ingestFiles({
          kbId: args.kbId,
          files: [{ buffer, filename: entry.name }],
          ...(parentNodeId != null ? { parentNodeId } : {}),
          ...(args.owner != null ? { owner: args.owner } : {}),
          ...(args.tags ? { tags: args.tags } : {}),
        })
        results.push(...items)
      }
    }

    await walk(resolved, 0)
    return results
  }

  static async ingestText(args: {
    kbId: string
    content: string
    name: string
    parentNodeId?: string | null
    owner?: string
    tags?: string[]
  }): Promise<KbDoc> {
    const cleaned = cleanMarkdown(args.content, { sourceDocId: 'pending' })
    return KbService.createDraft({
      kbId: args.kbId,
      ...(args.parentNodeId != null ? { parentNodeId: args.parentNodeId } : {}),
      name: args.name,
      content: cleaned,
      ...(args.owner != null ? { owner: args.owner } : {}),
      ...(args.tags ? { tags: args.tags } : {}),
    })
  }

  // ---------- 检索（兼容旧入口） ----------

  static async query(query: string, kbId?: string) {
    return retrieveAndRerank(KbService.resolveKbId(kbId), query)
  }
}
