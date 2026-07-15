import type { KbChunk } from '@agent/kb'
import type { KbDraftUpdate, KbMetaUpdate, KbQueryRequest } from '../../shared/kb'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
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
import { and, desc, eq, inArray, isNull, not, or, sql } from 'drizzle-orm'
import JSZip from 'jszip'
import { db } from '../db/drizzle'
import { kbChunks, kbDocuments, kbNodes, kbTags } from '../db/schema'

const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.docx', '.pdf', '.html', '.htm', '.txt'])
/** zip 导入仅收 Markdown，避免把包内杂项/Office 丢给 markitdown */
const ZIP_INGEST_EXTENSIONS = new Set(['.md', '.markdown'])
/** ingestFromPath 相对起点最多下钻的子目录层数（根目录本身为第 0 层） */
const INGEST_PATH_MAX_DEPTH = 5
/** commitBatch 并发提交数（受上游 LLM/embedding 限流约束，保守取 5） */
const KB_COMMIT_CONCURRENCY = 5

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

export interface KbTagRow {
  id: string
  kbId: string
  name: string
  color: string | null
  owner: string | null
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

/** macOS / Windows 压缩包噪音：__MACOSX、AppleDouble(._*)、.DS_Store 等，不当文档导入 */
function isJunkZipEntry(entryPath: string): boolean {
  const parts = entryPath.split(/[/\\]/).filter(Boolean)
  for (const part of parts) {
    if (part === '__MACOSX' || part === '.DS_Store' || part === 'Thumbs.db')
      return true
    // AppleDouble 资源叉：._PP.md 等，正文含 \0，写入 PG UTF8 会炸
    if (part.startsWith('._'))
      return true
  }
  return false
}

/** PG text 不允许 NUL；清理 markitdown / 二进制伪文本 */
function sanitizeTextContent(text: string): string {
  return text.replaceAll('\0', '')
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
  return {
    ...docSummary(row),
    content: row.content,
    permissions: (row.permissions ?? {}) as Record<string, unknown>,
  }
}

/**
 * 由父链 walk 派生 vdir。nodesMap 为该 kb 全部文件夹（id→row）。
 * 根级文档（parentId=null）→ vdir = name。
 */
function computeVdir(
  parentId: string | null,
  name: string,
  nodesMap: Map<string, typeof kbNodes.$inferSelect>,
): string {
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
   * 重命名文件夹：改 name，一次 vdir 重算 + Qdrant setPayload。
   * 同级重名 → KbConflictError(409)。
   */
  static async renameFolder(kbId: string, nodeId: string, name: string): Promise<KbNodeRow | null> {
    const ts = now()
    let updated: (typeof kbNodes.$inferSelect)[]
    try {
      updated = await db
        .update(kbNodes)
        .set({ updatedAt: ts, name })
        .where(and(eq(kbNodes.id, nodeId), eq(kbNodes.kbId, kbId)))
        .returning()
    }
    catch (err) {
      if (isUniqueViolation(err))
        throw new KbConflictError('a folder with the same name already exists at the target location')
      throw err
    }
    if (!updated[0])
      return null
    await KbService.recomputeAllVdirs(kbId)
    return nodeRow(updated[0])
  }

  /**
   * 移动文件夹到指定父下。newParentId 若为自身或其后代 → KbConflictError。
   * 同级重名 → KbConflictError(409)。
   */
  static async moveFolder(
    kbId: string,
    nodeId: string,
    parentId: string,
  ): Promise<KbNodeRow | null> {
    await KbService.assertNoFolderCycle(kbId, nodeId, parentId)
    const ts = now()
    let updated: (typeof kbNodes.$inferSelect)[]
    try {
      updated = await db
        .update(kbNodes)
        .set({ updatedAt: ts, parentId })
        .where(and(eq(kbNodes.id, nodeId), eq(kbNodes.kbId, kbId)))
        .returning()
    }
    catch (err) {
      if (isUniqueViolation(err))
        throw new KbConflictError('a folder with the same name already exists at the target location')
      throw err
    }
    if (!updated[0])
      return null
    await KbService.recomputeAllVdirs(kbId)
    return nodeRow(updated[0])
  }

  /** 移动文件夹到根级（parent_id = null）。同级重名 → KbConflictError(409)。 */
  static async moveFolderToRoot(kbId: string, nodeId: string): Promise<KbNodeRow | null> {
    const ts = now()
    let updated: (typeof kbNodes.$inferSelect)[]
    try {
      updated = await db
        .update(kbNodes)
        .set({ updatedAt: ts, parentId: null })
        .where(and(eq(kbNodes.id, nodeId), eq(kbNodes.kbId, kbId)))
        .returning()
    }
    catch (err) {
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
    return KbService.renameFolder(kbId, nodeId, name)
  }

  static async moveNode(
    kbId: string,
    nodeId: string,
    newParentId: string,
  ): Promise<KbNodeRow | null> {
    return KbService.moveFolder(kbId, nodeId, newParentId)
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
  private static async assertNoFolderCycle(
    kbId: string,
    nodeId: string,
    newParentId: string | null,
  ): Promise<void> {
    if (newParentId == null)
      return
    if (newParentId === nodeId)
      throw new KbConflictError('cannot move folder under itself')
    const nodes = await db
      .select({ id: kbNodes.id, parentId: kbNodes.parentId })
      .from(kbNodes)
      .where(eq(kbNodes.kbId, kbId))
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
        .where(and(
          eq(kbNodes.kbId, kbId),
          parentId == null ? isNull(kbNodes.parentId) : eq(kbNodes.parentId, parentId),
          eq(kbNodes.name, seg),
        ))
        .limit(1)
      if (existing[0]) {
        parentId = existing[0].id
        continue
      }
      const created = await KbService.createFolder({
        kbId,
        parentId,
        name: seg,
        ...(owner != null ? { owner } : {}),
      })
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
    await Promise.all(next.map(d =>
      db.update(kbDocuments).set({ vdir: d.vdir }).where(eq(kbDocuments.id, d.id)),
    ))
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
    // 保证 tag name 在 kb_tags 表：缺失则自动建（无 color），与 patchMeta 保持一致
    if (args.tags != null && args.tags.length) {
      const existing = new Set(
        (await db
          .select({ name: kbTags.name })
          .from(kbTags)
          .where(and(
            eq(kbTags.kbId, args.kbId),
            ...(args.owner != null ? [eq(kbTags.owner, args.owner)] : []),
          )))
          .map(r => r.name),
      )
      for (const name of args.tags) {
        if (existing.has(name))
          continue
        await KbService.createTag({
          kbId: args.kbId,
          name,
          ...(args.owner != null ? { owner: args.owner } : {}),
        }).catch(() => {})
        existing.add(name)
      }
    }
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
    if (args.parentNodeId !== undefined) {
      conditions.push(
        args.parentNodeId == null
          ? isNull(kbDocuments.parentNodeId)
          : eq(kbDocuments.parentNodeId, args.parentNodeId),
      )
    }

    const rows = await db
      .select()
      .from(kbDocuments)
      .where(and(...conditions))
      .orderBy(desc(kbDocuments.pinned), desc(kbDocuments.updatedAt))
    return rows.map(docSummary)
  }

  static async saveDraft(id: string, patch: KbDraftUpdate): Promise<KbDoc | null> {
    // 内容变才标脏（completed→draft）；改名不触发重 embed 但仍记 updated_at
    const before = await db
      .select({ status: kbDocuments.indexingStatus })
      .from(kbDocuments)
      .where(eq(kbDocuments.id, id))
      .limit(1)
    if (!before[0])
      return null
    if (before[0].status === 'indexing')
      throw new KbConflictError('document is already indexing')
    // 内容变才标脏：completed 或 error 都回退 draft（error 时清掉错误信息，便于重提交）
    const dirtied = patch.content != null && (before[0].status === 'completed' || before[0].status === 'error')

    const updated = await db
      .update(kbDocuments)
      .set({
        ...(patch.content != null
          ? { content: patch.content, draftHash: hashContent(patch.content) }
          : {}),
        ...(patch.name != null ? { name: patch.name } : {}),
        ...(dirtied
          ? { indexingStatus: 'draft' as const, error: null }
          : {}),
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

  static async updateMeta(id: string, patch: KbMetaUpdate): Promise<KbDoc | null> {
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

    // 加 tag 时保证 name 在 kb_tags 表：缺失则自动建（无 color），保证"文档标签属于标签管理的标签"
    if (patch.tags != null && patch.tags.length) {
      const existing = new Set(
        (await db
          .select({ name: kbTags.name })
          .from(kbTags)
          .where(and(
            eq(kbTags.kbId, row.kbId),
            ...(row.owner != null ? [eq(kbTags.owner, row.owner)] : []),
          )))
          .map(r => r.name),
      )
      const owner = row.owner
      for (const name of patch.tags) {
        if (existing.has(name))
          continue
        await KbService.createTag({
          kbId: row.kbId,
          name,
          ...(owner != null ? { owner } : {}),
        }).catch(() => {})
        existing.add(name)
      }
    }

    return docFull(row)
  }

  static async removeDoc(id: string): Promise<boolean> {
    // 先取 chunk point ids，删 Qdrant；再删 PG 行（级联删 kb_chunks）。
    const doc = await db
      .select({ kbId: kbDocuments.kbId })
      .from(kbDocuments)
      .where(eq(kbDocuments.id, id))
      .limit(1)
    if (!doc[0])
      return false
    const chunks = await db
      .select({ id: kbChunks.id })
      .from(kbChunks)
      .where(eq(kbChunks.docId, id))
    if (chunks.length)
      await deleteByPointIds(doc[0].kbId, chunks.map(c => c.id))
    const deleted = await db
      .delete(kbDocuments)
      .where(eq(kbDocuments.id, id))
      .returning({ id: kbDocuments.id })
    return deleted.length > 0
  }

  static async listTags(kbId: string, owner?: string): Promise<KbTagRow[]> {
    const rows = await db
      .select()
      .from(kbTags)
      .where(and(eq(kbTags.kbId, kbId), ...(owner != null ? [eq(kbTags.owner, owner)] : [])))
      .orderBy(kbTags.name)
    return rows.map((r): KbTagRow => ({
      id: r.id,
      kbId: r.kbId,
      name: r.name,
      color: r.color,
      owner: r.owner,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
  }

  /** 新建标签。同名（同 kb+owner）→ KbConflictError(409) */
  static async createTag(args: {
    kbId: string
    name: string
    color?: string
    owner?: string
  }): Promise<KbTagRow> {
    const id = randomUUID()
    const ts = now()
    try {
      await db.insert(kbTags).values({
        id,
        kbId: args.kbId,
        name: args.name,
        color: args.color ?? null,
        owner: args.owner ?? null,
        createdAt: ts,
        updatedAt: ts,
      })
    }
    catch (err) {
      if (isUniqueViolation(err))
        throw new KbConflictError('tag with the same name already exists')
      throw err
    }
    const row = await db.select().from(kbTags).where(eq(kbTags.id, id)).limit(1)
    const r = row[0]!
    return {
      id: r.id,
      kbId: r.kbId,
      name: r.name,
      color: r.color,
      owner: r.owner,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }
  }

  /**
   * 重命名标签：刷所有引用旧 name 的文档 kb_documents.tags → 新 name + 已提交文档 Qdrant payload tags；
   * 再改 kb_tags.name。同名冲突→409。返回受影响文档数。
   */
  static async renameTag(
    tagId: string,
    name: string,
    owner: string,
  ): Promise<{ affectedDocs: number } | null> {
    const tag = (await db.select().from(kbTags).where(eq(kbTags.id, tagId)).limit(1))[0]
    if (!tag || tag.owner !== owner)
      return null
    if (tag.name === name)
      return { affectedDocs: 0 }

    // 同 kb+owner 下同名（排除自己）→ 409
    const dup = await db
      .select({ id: kbTags.id })
      .from(kbTags)
      .where(and(
        eq(kbTags.kbId, tag.kbId),
        eq(kbTags.name, name),
        not(eq(kbTags.id, tagId)),
        ...(tag.owner != null
          ? [eq(kbTags.owner, tag.owner)]
          : [isNull(kbTags.owner)]),
      ))
      .limit(1)
    if (dup[0])
      throw new KbConflictError('tag with the same name already exists')

    // 刷文档 tags 数组：old name → new name
    const affected = await db.execute<{ id: string }>(sql`
      UPDATE kb_documents
      SET tags = ARRAY(SELECT DISTINCT CASE WHEN x = ${tag.name} THEN ${name} ELSE x END FROM unnest(tags) AS x),
          updated_at = ${now()}
      WHERE kb_id = ${tag.kbId} AND tags @> ARRAY[${tag.name}]::text[]
      RETURNING id
    `)
    const affectedIds = (affected.rows ?? []).map(r => r.id)

    // 已提交文档同步 Qdrant payload tags（已刷成新 name，查出当前 tags 再 setPayload）
    if (affectedIds.length) {
      const docs = await db.select({ id: kbDocuments.id })
        .from(kbDocuments)
        .where(and(
          inArray(kbDocuments.id, affectedIds),
          eq(kbDocuments.indexingStatus, 'completed'),
        ))
      for (const d of docs) {
        const r = (await db
          .select({ tags: kbDocuments.tags })
          .from(kbDocuments)
          .where(eq(kbDocuments.id, d.id))
          .limit(1))[0]
        await setPayloadByDocId(tag.kbId, d.id, { tags: r?.tags ?? [] })
      }
    }

    await db.update(kbTags).set({ name, updatedAt: now() }).where(eq(kbTags.id, tagId))
    return { affectedDocs: affectedIds.length }
  }

  /**
   * 删除标签：从所有引用文档的 kb_documents.tags 移除该 name + 已提交文档 Qdrant payload 同步；
   * 再删 kb_tags 行。**文档保留**（只去标签）。返回受影响文档数。
   */
  static async deleteTag(
    tagId: string,
    owner: string,
    dryRun = false,
  ): Promise<{ affectedDocs: number } | null> {
    const tag = (await db.select().from(kbTags).where(eq(kbTags.id, tagId)).limit(1))[0]
    if (!tag || tag.owner !== owner)
      return null

    // dryRun：只查影响数，不删
    if (dryRun) {
      const res = await db.execute<{ id: string }>(sql`
        SELECT id FROM kb_documents WHERE kb_id = ${tag.kbId} AND tags @> ARRAY[${tag.name}]::text[]
      `)
      return { affectedDocs: (res.rows ?? []).length }
    }

    const affected = await db.execute<{ id: string }>(sql`
      UPDATE kb_documents
      SET tags = ARRAY(SELECT x FROM unnest(tags) AS x WHERE x <> ${tag.name}),
          updated_at = ${now()}
      WHERE kb_id = ${tag.kbId} AND tags @> ARRAY[${tag.name}]::text[]
      RETURNING id
    `)
    const affectedIds = (affected.rows ?? []).map(r => r.id)

    if (affectedIds.length) {
      const docs = await db.select({ id: kbDocuments.id })
        .from(kbDocuments)
        .where(and(
          inArray(kbDocuments.id, affectedIds),
          eq(kbDocuments.indexingStatus, 'completed'),
        ))
      for (const d of docs) {
        const r = (await db
          .select({ tags: kbDocuments.tags })
          .from(kbDocuments)
          .where(eq(kbDocuments.id, d.id))
          .limit(1))[0]
        await setPayloadByDocId(tag.kbId, d.id, { tags: r?.tags ?? [] })
      }
    }

    await db.delete(kbTags).where(eq(kbTags.id, tagId))
    return { affectedDocs: affectedIds.length }
  }

  /** 改标签颜色（仅元数据，不触文档/Qdrant） */
  static async updateTagColor(
    tagId: string,
    color: string | null,
    owner: string,
  ): Promise<KbTagRow | null> {
    const tag = (await db.select().from(kbTags).where(eq(kbTags.id, tagId)).limit(1))[0]
    if (!tag || tag.owner !== owner)
      return null
    const updated = await db
      .update(kbTags)
      .set({ color, updatedAt: now() })
      .where(eq(kbTags.id, tagId))
      .returning()
    if (!updated[0])
      return null
    const r = updated[0]
    return {
      id: r.id,
      kbId: r.kbId,
      name: r.name,
      color: r.color,
      owner: r.owner,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }
  }

  // ---------- 提交（异步预处理，整文档重建） ----------

  /**
   * 提交草稿：chunk + enrich + embed + Qdrant 重建。
   * status:indexing 期间拒绝重复提交（KbConflictError）；失败置 error。
   * @param id 文档 ID
   * @param opts 提交选项
   * @param opts.skipEnrich 跳过 LLM enrich（测试/离线用）。
   */
  static async commit(id: string, opts: { skipEnrich: boolean }): Promise<KbDoc> {
    const ts = now()
    const claimed = await db
      .update(kbDocuments)
      .set({ indexingStatus: 'indexing', error: null, updatedAt: ts })
      .where(and(eq(kbDocuments.id, id), not(eq(kbDocuments.indexingStatus, 'indexing'))))
      .returning()
    if (!claimed[0])
      throw new KbConflictError('document is already indexing')

    try {
      await KbService.runCommit(claimed[0], opts.skipEnrich)
      const row = await db.select().from(kbDocuments).where(eq(kbDocuments.id, id)).limit(1)
      return docFull(row[0]!)
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db.update(kbDocuments).set({ indexingStatus: 'error', error: message, updatedAt: now() }).where(eq(kbDocuments.id, id))
      throw err
    }
  }

  static async commitBatch(ids: string[], opts: { skipEnrich: boolean }): Promise<void> {
    if (!ids.length)
      return
    // 并发提交：单篇失败不中断其他（commit 内部已置 indexingStatus=error），最后聚合抛错
    const concurrency = Math.min(KB_COMMIT_CONCURRENCY, ids.length)
    let cursor = 0
    const failures: string[] = []
    const worker = async (): Promise<void> => {
      while (cursor < ids.length) {
        const id = ids[cursor]!
        cursor++
        try {
          await KbService.commit(id, opts)
        }
        catch {
          failures.push(id)
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    if (failures.length)
      throw new Error(`commitBatch: ${failures.length}/${ids.length} failed: ${failures.join(', ')}`)
  }

  private static async runCommit(
    doc: typeof kbDocuments.$inferSelect,
    skipEnrich: boolean,
  ): Promise<void> {
    const kbId = doc.kbId
    const id = doc.id
    const content = doc.content

    // 1. clean + chunk
    const cleaned = cleanMarkdown(content, {
      sourceDocId: id,
      ...(doc.vdir ? { baseUrl: doc.vdir } : {}),
    })
    const chunks: KbChunk[] = await chunkMarkdown(cleaned, { sourceDocId: id })
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
    const oldChunks = await db
      .select({ id: kbChunks.id })
      .from(kbChunks)
      .where(eq(kbChunks.docId, id))
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
      const ext = path.extname(file.filename).toLowerCase()
      if (ext === '.zip') {
        throw new Error(
          `「${file.filename}」是 zip 压缩包，请改用「压缩包」引入（会按目录还原结构）；`
          + `多文件上传不支持直接丢给 markitdown 解压`,
        )
      }
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        throw new Error(
          `不支持的文件类型「${file.filename}」（扩展名 ${ext || '(无)'}）；`
          + `支持 ${[...SUPPORTED_EXTENSIONS].join(' ')}`,
        )
      }

      const markdown = sanitizeTextContent(
        await loadDocumentMarkdown(file.buffer, file.filename),
      )
      const cleaned = cleanMarkdown(markdown, { sourceDocId: 'pending', ...(args.parentNodeId ? {} : {}) })
      const draftHash = hashContent(cleaned)
      const name = path.parse(file.filename).name

      // 去重：同 parent+name 已存在
      const existing = await db
        .select()
        .from(kbDocuments)
        .where(and(
          eq(kbDocuments.kbId, args.kbId),
          eq(kbDocuments.name, name),
          args.parentNodeId == null
            ? isNull(kbDocuments.parentNodeId)
            : eq(kbDocuments.parentNodeId, args.parentNodeId),
        ))
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
   * 从 zip 压缩包导入草稿。按 zip 内相对路径还原目录树（挂根级），最多 {@link INGEST_PATH_MAX_DEPTH} 层子目录。
   * 含 `..` 逃逸段的 entry 跳过（防 zip slip），不中断整批。
   */
  static async ingestFromZip(args: {
    kbId: string
    zip: Buffer
    owner?: string
    tags?: string[]
  }): Promise<KbIngestResultItem[]> {
    const jszip = await JSZip.loadAsync(args.zip)
    const results: KbIngestResultItem[] = []

    const entries = Object.values(jszip.files)
      .filter(f => !f.dir)
      .filter(f => !isJunkZipEntry(f.name))
      .filter(f => ZIP_INGEST_EXTENSIONS.has(path.extname(f.name).toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      // 防 zip slip：单 entry 含 `..` 逃逸段则跳过，不中断整批
      let segments: string[]
      try {
        segments = sanitizePathSegments(entry.name.split('/'))
      }
      catch {
        continue
      }
      if (segments.length > INGEST_PATH_MAX_DEPTH + 1)
        continue
      // 规范化后仍可能留下噪音段名（如仅剩 ._foo.md）
      if (isJunkZipEntry(segments.join('/')))
        continue

      try {
        const buffer = Buffer.from(await entry.async('uint8array'))
        const folderSegments = segments.slice(0, -1)
        const filename = segments[segments.length - 1]!
        const parentNodeId = folderSegments.length
          ? (await KbService.ensureNodePath({
              kbId: args.kbId,
              segments: folderSegments,
              ...(args.owner != null ? { owner: args.owner } : {}),
            })) ?? null
          : null

        const items = await KbService.ingestFiles({
          kbId: args.kbId,
          files: [{ buffer, filename }],
          ...(parentNodeId != null ? { parentNodeId } : {}),
          ...(args.owner != null ? { owner: args.owner } : {}),
          ...(args.tags ? { tags: args.tags } : {}),
        })
        results.push(...items)
      }
      catch (err) {
        // 单文件失败不中断整包（常见：个别坏文件 / 非文本）
        console.warn(
          `[kb] ingestFromZip skip ${entry.name}:`,
          err instanceof Error ? err.message : err,
        )
      }
    }
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

  /**
   * 检索
   * @description 检索知识库，返回检索结果
   */
  static async query(
    query: string,
    kbId?: string,
    req?: Omit<KbQueryRequest, 'query' | 'kbId'>,
  ) {
    return retrieveAndRerank(KbService.resolveKbId(kbId), query, {
      skipRerank: req?.options?.skipRerank === true,
      recallK: req?.options?.recallK ?? 60,
    })
  }
}
