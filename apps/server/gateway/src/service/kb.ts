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
import { dirVdir } from '@agent/project'
import { and, desc, eq, inArray, isNull, not, sql } from 'drizzle-orm'
import JSZip from 'jszip'
import { db } from '../db/drizzle'
import { dirs, kbChunks, kbDocTags, kbDocuments, kbs, skills } from '../db/schema'
import { ProjectService } from './project'
import { ancestorIdsOf, assertNotSkillSubtree, loadLiveDirs, subtreeIdsOf } from './skill'
import { TagsService } from './tags'

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

export interface KbDocSummary {
  id: string
  userId: string
  kbId: string
  /** 挂载 dirs.id（权威位置）；必须落在已初始化知识库子树内 */
  mountDirId: string
  /** 冗余缓存 = walkToProjectRoot(mountDirId) */
  projectId: string | null
  name: string
  filename: string | null
  /** 派生展示缓存 = dirVdir(mountDir.vdir, name)；folder 改名/移动后可能软过期，client 据 dir 树重派生 */
  vdir: string | null
  tagIds: string[]
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
  mountDirId: string
  skipped: boolean
}

// ---------- 工具 ----------

function now(): number {
  return Date.now()
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

function docSummary(row: typeof kbDocuments.$inferSelect): KbDocSummary {
  return {
    id: row.id,
    userId: row.userId,
    kbId: row.kbId,
    mountDirId: row.mountDirId,
    projectId: row.projectId,
    name: row.name,
    filename: row.filename,
    vdir: row.vdir,
    tagIds: [],
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

async function attachTagIdsToDocs<T extends { id: string }>(
  docs: T[],
): Promise<(T & { tagIds: string[] })[]> {
  if (!docs.length)
    return docs.map(d => ({ ...d, tagIds: [] }))
  const rows = await db
    .select({ docId: kbDocTags.docId, tagId: kbDocTags.tagId })
    .from(kbDocTags)
    .where(inArray(kbDocTags.docId, docs.map(d => d.id)))
  const byDoc = new Map<string, string[]>()
  for (const row of rows) {
    const list = byDoc.get(row.docId) ?? []
    list.push(row.tagId)
    byDoc.set(row.docId, list)
  }
  return docs.map(d => ({ ...d, tagIds: byDoc.get(d.id) ?? [] }))
}

async function attachTagIdsToDoc<T extends { id: string }>(
  doc: T,
): Promise<T & { tagIds: string[] }> {
  const [withTags] = await attachTagIdsToDocs([doc])
  return withTags!
}

/**
 * 取挂载 dir 的 vdir + projectId（认 id 不认 name）。
 * mountDirId 不在/非本人 → null。
 * 用 dirs.projectId 缓存（= walkToProjectRoot 派生，server 维护），无需再 walk。
 */
async function loadMount(
  mountDirId: string | null,
  userId: string,
): Promise<{ vdir: string, projectId: string } | null> {
  if (!mountDirId)
    return null
  const [row] = await db
    .select({ vdir: dirs.vdir, projectId: dirs.projectId })
    .from(dirs)
    .where(and(eq(dirs.id, mountDirId), eq(dirs.userId, userId), eq(dirs.deleted, false)))
    .limit(1)
  return row ? { vdir: row.vdir, projectId: row.projectId } : null
}

/**
 * 收集 rootDirId 子树全部 live dir id（含自身）—— listDocs includeDescendants 用。
 * 内存 BFS（结构靠 parentId 链，无 ltree）；只取 id/parentId 两列。
 */
async function subtreeMountDirIds(userId: string, rootDirId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: dirs.id, parentId: dirs.parentId })
    .from(dirs)
    .where(and(eq(dirs.userId, userId), eq(dirs.deleted, false)))
  const childrenOf = new Map<string, string[]>()
  for (const r of rows) {
    if (r.parentId == null)
      continue
    const list = childrenOf.get(r.parentId) ?? []
    list.push(r.id)
    childrenOf.set(r.parentId, list)
  }
  const ids = new Set<string>()
  const stack = [rootDirId]
  while (stack.length > 0) {
    const cur = stack.pop()!
    if (ids.has(cur))
      continue
    ids.add(cur)
    for (const child of childrenOf.get(cur) ?? [])
      stack.push(child)
  }
  return ids
}

export interface KbBinding {
  dirId: string
  userId: string
  dirName: string
  vdir: string
}

export async function findEnclosingKbDirId(userId: string, dirId: string | null | undefined): Promise<string | null> {
  if (dirId == null)
    return null
  const all = await loadLiveDirs(userId)
  const chain = ancestorIdsOf(all, dirId)
  if (chain.length === 0)
    return null
  const rows = await db.select({ dirId: kbs.dirId }).from(kbs).where(and(
    eq(kbs.userId, userId),
    inArray(kbs.dirId, chain),
  ))
  const marked = new Set(rows.map(r => r.dirId))
  for (const id of chain) {
    if (marked.has(id))
      return id
  }
  return null
}

export class KbService {
  static async listBindings(userId: string): Promise<KbBinding[]> {
    const rows = await db.select().from(kbs).where(eq(kbs.userId, userId))
    if (rows.length === 0)
      return []
    const dirRows = await db.select().from(dirs).where(and(
      eq(dirs.userId, userId),
      inArray(dirs.id, rows.map(r => r.dirId)),
      eq(dirs.deleted, false),
    ))
    const dirById = new Map(dirRows.map(d => [d.id, d]))
    const out: KbBinding[] = []
    for (const r of rows) {
      const dir = dirById.get(r.dirId)
      if (!dir)
        continue
      out.push({
        dirId: r.dirId,
        userId: r.userId,
        dirName: dir.name,
        vdir: dir.vdir,
      })
    }
    return out
  }

  static async mark(userId: string, dirId: string): Promise<KbBinding> {
    const all = await loadLiveDirs(userId)
    const dir = all.find(d => d.id === dirId)
    if (!dir)
      throw new KbConflictError('dir 不存在或不可见')
    if (dir.kind !== 'dir')
      throw new KbConflictError('只能把子文件夹初始化为知识库（项目根不行）')
    await assertNotSkillSubtree(userId, dirId)
    const chain = ancestorIdsOf(all, dirId)
    const subtree = subtreeIdsOf(all, dirId)
    const [already] = await db.select().from(kbs).where(eq(kbs.dirId, dirId)).limit(1)
    if (already)
      throw new KbConflictError('该文件夹已是知识库')
    const ancestorIds = chain.filter(id => id !== dirId)
    if (ancestorIds.length > 0) {
      const ancestorKbs = await db.select({ dirId: kbs.dirId }).from(kbs).where(and(
        eq(kbs.userId, userId),
        inArray(kbs.dirId, ancestorIds),
      ))
      if (ancestorKbs.length > 0)
        throw new KbConflictError('禁止嵌套知识库')
    }
    const descendantIds = subtree.filter(id => id !== dirId)
    if (descendantIds.length > 0) {
      const childKbs = await db.select({ dirId: kbs.dirId }).from(kbs).where(and(
        eq(kbs.userId, userId),
        inArray(kbs.dirId, descendantIds),
      ))
      if (childKbs.length > 0)
        throw new KbConflictError('子树内已有知识库')
    }
    const childSkills = await db.select({ id: skills.id }).from(skills).where(and(
      eq(skills.userId, userId),
      inArray(skills.dirId, subtree),
    )).limit(1)
    if (childSkills[0])
      throw new KbConflictError('禁止在含 skill 的目录上初始化知识库')
    await db.insert(kbs).values({ dirId, userId })
    return {
      dirId: dir.id,
      userId,
      dirName: dir.name,
      vdir: dir.vdir,
    }
  }

  static async unmark(userId: string, dirId: string): Promise<void> {
    const [row] = await db.select().from(kbs).where(and(eq(kbs.dirId, dirId), eq(kbs.userId, userId))).limit(1)
    if (!row)
      throw new KbConflictError('知识库不存在或不可见')
    const [doc] = await db.select({ id: kbDocuments.id }).from(kbDocuments).where(and(
      eq(kbDocuments.userId, userId),
      eq(kbDocuments.kbId, dirId),
    )).limit(1)
    if (doc)
      throw new KbConflictError('知识库下仍有文档，无法卸标')
    await db.delete(kbs).where(eq(kbs.dirId, dirId))
  }

  // ---------- vdir 重算（PG only，零 Qdrant 写） ----------

  /** 重算单个文档的 vdir 展示缓存（mountDir/name 变更时）。不触 Qdrant（vdir 不进 payload）。 */
  static async recomputeVdir(docId: string): Promise<string | null> {
    const [doc] = await db.select().from(kbDocuments).where(eq(kbDocuments.id, docId)).limit(1)
    if (!doc)
      return null
    const mount = await loadMount(doc.mountDirId, doc.userId)
    const vdir = dirVdir(mount?.vdir ?? null, doc.name)
    await db.update(kbDocuments).set({ vdir }).where(eq(kbDocuments.id, docId))
    return vdir
  }

  /**
   * 重算某用户全部文档的 vdir 展示缓存（维护用，folder 改名/移动后可调刷新软过期缓存）。
   * 纯 PG，不触 Qdrant。folder 操作走 ProjectService，dirs.vdir 已即时翻新；此方法补刷 docs.vdir。
   */
  static async recomputeAllVdirs(userId: string): Promise<void> {
    const dirRows = await db
      .select({ id: dirs.id, vdir: dirs.vdir })
      .from(dirs)
      .where(and(eq(dirs.userId, userId), eq(dirs.deleted, false)))
    const vdirByDir = new Map(dirRows.map(d => [d.id, d.vdir]))
    const docs = await db
      .select({ id: kbDocuments.id, mountDirId: kbDocuments.mountDirId, name: kbDocuments.name })
      .from(kbDocuments)
      .where(eq(kbDocuments.userId, userId))
    if (!docs.length)
      return
    await Promise.all(docs.map((d) => {
      const mv = d.mountDirId ? (vdirByDir.get(d.mountDirId) ?? null) : null
      const vdir = dirVdir(mv, d.name)
      return db.update(kbDocuments).set({ vdir }).where(eq(kbDocuments.id, d.id))
    }))
  }

  /**
   * 跨 project move 后同步子树挂载文档的 projectId（PG + Qdrant setPayload，不重 embed）。
   * 由 ProjectService.move 跨 project 时调用；project 域不直接触 Qdrant，经此委托。
   */
  static async syncProjectIdForSubtree(
    userId: string,
    subtreeDirIds: string[],
    newProjectId: string,
  ): Promise<void> {
    if (!subtreeDirIds.length)
      return
    const docs = await db
      .select({
        id: kbDocuments.id,
        kbId: kbDocuments.kbId,
        mountDirId: kbDocuments.mountDirId,
        indexingStatus: kbDocuments.indexingStatus,
      })
      .from(kbDocuments)
      .where(and(eq(kbDocuments.userId, userId), inArray(kbDocuments.mountDirId, subtreeDirIds)))
    const kbByMount = new Map<string, string>()
    for (const mount of new Set(docs.map(d => d.mountDirId))) {
      const kbId = await findEnclosingKbDirId(userId, mount)
      if (!kbId)
        throw new KbConflictError('移动后文档须仍在已初始化的知识库内')
      kbByMount.set(mount, kbId)
    }
    await Promise.all(docs.map(d => db
      .update(kbDocuments)
      .set({ projectId: newProjectId, kbId: kbByMount.get(d.mountDirId)! })
      .where(eq(kbDocuments.id, d.id))))
    const indexed = docs.filter(d => d.indexingStatus === 'completed')
    await Promise.all(indexed.map(d => setPayloadByDocId(
      kbByMount.get(d.mountDirId)!,
      d.id,
      { project_id: newProjectId },
    )))
  }

  // ---------- 草稿 CRUD ----------

  static async createDraft(args: {
    userId: string
    kbId?: string
    mountDirId: string
    name: string
    content?: string
    owner?: string
    tagIds?: string[]
    tags?: string[]
    filename?: string
  }): Promise<KbDoc> {
    const id = randomUUID()
    const ts = now()
    const content = args.content ?? ''
    const draftHash = hashContent(content)
    const mountDirId = args.mountDirId
    await assertNotSkillSubtree(args.userId, mountDirId)
    const kbId = await findEnclosingKbDirId(args.userId, mountDirId)
    if (!kbId)
      throw new KbConflictError('请先把目标文件夹初始化为知识库')
    if (args.kbId != null && args.kbId !== kbId)
      throw new KbConflictError('kbId 与包围知识库不一致')
    const mount = await loadMount(mountDirId, args.userId)
    const vdir = dirVdir(mount?.vdir ?? null, args.name)
    const projectId = mount?.projectId ?? null

    await db.insert(kbDocuments).values({
      id,
      userId: args.userId,
      kbId,
      mountDirId,
      projectId,
      name: args.name,
      filename: args.filename ?? null,
      vdir,
      content,
      draftHash,
      publishedHash: null,
      owner: args.owner ?? args.userId,
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

    if (args.owner ?? args.userId) {
      const owner = args.owner ?? args.userId
      if (args.tagIds?.length) {
        await TagsService.setDocTagIds(id, owner, args.tagIds)
      }
      else if (args.tags?.length) {
        const nameMap = await TagsService.ensureByNames(owner, args.tags)
        const tagIds = args.tags.map(n => nameMap.get(n)).filter((tid): tid is string => !!tid)
        await TagsService.setDocTagIds(id, owner, tagIds)
      }
    }

    const row = await db.select().from(kbDocuments).where(eq(kbDocuments.id, id)).limit(1)
    return attachTagIdsToDoc(docFull(row[0]!))
  }

  static async getDoc(id: string): Promise<KbDoc | null> {
    const rows = await db.select().from(kbDocuments).where(eq(kbDocuments.id, id)).limit(1)
    return rows[0] ? attachTagIdsToDoc(docFull(rows[0])) : null
  }

  static async listDocs(args: {
    userId: string
    tagId?: string
    owner?: string
    /** 仅列挂载到该 dir 的文档 */
    dirId?: string
    /** 含子树全部 dir 下文档（dirId 必填） */
    includeDescendants?: boolean
  }): Promise<KbDocSummary[]> {
    const conditions = [eq(kbDocuments.userId, args.userId)]
    if (args.owner != null)
      conditions.push(eq(kbDocuments.owner, args.owner))
    if (args.tagId != null) {
      conditions.push(sql`exists (select 1 from kb_doc_tags where doc_id = ${kbDocuments.id} and tag_id = ${args.tagId})`)
    }
    if (args.dirId != null) {
      if (args.includeDescendants) {
        const ids = await subtreeMountDirIds(args.userId, args.dirId)
        conditions.push(inArray(kbDocuments.mountDirId, [...ids]))
      }
      else {
        // dirId 精确匹配挂载点
        conditions.push(eq(kbDocuments.mountDirId, args.dirId))
      }
    }

    const rows = await db
      .select()
      .from(kbDocuments)
      .where(and(...conditions))
      .orderBy(desc(kbDocuments.pinned), desc(kbDocuments.updatedAt))
    return attachTagIdsToDocs(rows.map(docSummary))
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
    return attachTagIdsToDoc(docFull(updated[0]))
  }

  static async updateMeta(id: string, patch: KbMetaUpdate): Promise<KbDoc | null> {
    const before = await db
      .select()
      .from(kbDocuments)
      .where(eq(kbDocuments.id, id))
      .limit(1)
    if (!before[0])
      return null
    const prev = before[0]
    const mountChanged = patch.mountDirId !== undefined && patch.mountDirId !== prev.mountDirId
    const nameChanged = patch.name != null && patch.name !== prev.name

    let nextKbId = prev.kbId
    let nextProjectId = prev.projectId
    if (mountChanged) {
      const dest = patch.mountDirId
      if (dest == null)
        throw new KbConflictError('文档必须挂在知识库文件夹下')
      await assertNotSkillSubtree(prev.userId, dest)
      const kbId = await findEnclosingKbDirId(prev.userId, dest)
      if (kbId == null)
        throw new KbConflictError('请先把目标文件夹初始化为知识库')
      nextKbId = kbId
      nextProjectId = (await loadMount(dest, prev.userId))?.projectId ?? null
    }

    const updated = await db
      .update(kbDocuments)
      .set({
        updatedAt: now(),
        ...(patch.mountDirId !== undefined ? { mountDirId: patch.mountDirId } : {}),
        ...(patch.name != null ? { name: patch.name } : {}),
        ...(patch.owner !== undefined ? { owner: patch.owner } : {}),
        ...(patch.visibility != null ? { visibility: patch.visibility } : {}),
        ...(patch.pinned != null ? { pinned: patch.pinned } : {}),
        ...(mountChanged ? { projectId: nextProjectId, kbId: nextKbId } : {}),
      })
      .where(eq(kbDocuments.id, id))
      .returning()
    let row = updated[0]
    if (!row)
      return null

    // 位置/名称变 → 重算 vdir 展示缓存（PG only）
    if (mountChanged || nameChanged) {
      const vdir = await KbService.recomputeVdir(id)
      if (vdir != null)
        row = { ...row, vdir }
      // doc move（mountDirId 变）→ setPayload({mount_dir_id, project_id})，不重 embed
      // name 改 → 零 Qdrant 写（id 稳定，vdir 不进 payload）
      if (mountChanged && row.indexingStatus === 'completed') {
        await setPayloadByDocId(row.kbId, id, {
          mount_dir_id: row.mountDirId,
          project_id: row.projectId,
        })
      }
    }

    if (patch.tagIds !== undefined && row.owner) {
      await TagsService.setDocTagIds(id, row.owner, patch.tagIds)
      if (row.indexingStatus === 'completed')
        await TagsService.syncQdrantTagIds(row.kbId, id)
    }

    return attachTagIdsToDoc(docFull(row))
  }

  static async removeDoc(id: string): Promise<boolean> {
    // 先取 chunk point ids，删 Qdrant；再删 PG 行（级联删 kb_chunks）。
    const [doc] = await db
      .select({ kbId: kbDocuments.kbId })
      .from(kbDocuments)
      .where(eq(kbDocuments.id, id))
      .limit(1)
    if (!doc)
      return false
    const chunks = await db
      .select({ id: kbChunks.id })
      .from(kbChunks)
      .where(eq(kbChunks.docId, id))
    if (chunks.length)
      await deleteByPointIds(doc.kbId, chunks.map(c => c.id))
    const deleted = await db
      .delete(kbDocuments)
      .where(eq(kbDocuments.id, id))
      .returning({ id: kbDocuments.id })
    return deleted.length > 0
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
      return attachTagIdsToDoc(docFull(row[0]!))
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
    const kbId = doc.kbId // 全局 collection，仅标签用；Qdrant 忽略
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
    const tagIds = await TagsService.getDocTagIds(id)
    let summary: string | null = null
    let keywords: string[] = []
    let toc: string[] = []
    if (!skipEnrich && content.trim()) {
      const enriched = await enrichDocument({
        source_doc_id: id,
        filename: doc.filename ?? doc.name,
        content_hash: doc.draftHash ?? '',
        markdown: cleaned,
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

    // 4. embed + upsert（point id = chunk uuid，payload 含 mount_dir_id/project_id/owner/tag_ids）
    if (chunks.length) {
      await embedAndUpsert({
        kbId,
        docId: id,
        ...(doc.mountDirId != null ? { mountDirId: doc.mountDirId } : {}),
        ...(doc.projectId != null ? { projectId: doc.projectId } : {}),
        ...(doc.owner != null ? { owner: doc.owner } : {}),
        ...(tagIds.length ? { tagIds } : {}),
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
          headingPath: chunk.heading_path,
          pageNumber: chunk.page_number ?? null,
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
    userId: string
    files: KbIngestFile[]
    mountDirId: string
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
      const cleaned = cleanMarkdown(markdown, { sourceDocId: 'pending' })
      const draftHash = hashContent(cleaned)
      const name = path.parse(file.filename).name
      const mountDirId = args.mountDirId

      // 去重：同 mountDirId+name 已存在
      const [existing] = await db
        .select()
        .from(kbDocuments)
        .where(and(
          eq(kbDocuments.userId, args.userId),
          eq(kbDocuments.name, name),
          eq(kbDocuments.mountDirId, mountDirId),
        ))
        .limit(1)

      if (existing) {
        if (existing.draftHash === draftHash) {
          results.push({ docId: existing.id, name, mountDirId: existing.mountDirId, skipped: true })
          continue
        }
        // 内容变了：更新草稿，回退 status
        await db.update(kbDocuments).set({
          content: cleaned,
          draftHash,
          filename: file.filename,
          indexingStatus: existing.indexingStatus === 'completed' ? 'draft' : existing.indexingStatus,
          updatedAt: now(),
        }).where(eq(kbDocuments.id, existing.id))
        results.push({ docId: existing.id, name, mountDirId: existing.mountDirId, skipped: false })
        continue
      }

      const doc = await KbService.createDraft({
        userId: args.userId,
        mountDirId,
        name,
        content: cleaned,
        ...(args.owner != null ? { owner: args.owner } : {}),
        ...(args.tags ? { tags: args.tags } : {}),
        filename: file.filename,
      })
      results.push({ docId: doc.id, name, mountDirId: doc.mountDirId, skipped: false })
    }
    return results
  }

  /**
   * 从 zip 压缩包导入草稿。按 zip 内相对路径还原目录树（挂到 mountDirId 下），最多 {@link INGEST_PATH_MAX_DEPTH} 层子目录。
   * 含 `..` 逃逸段的 entry 跳过（防 zip slip），不中断整批。
   * 目录 find-or-create 走 ProjectService.createDir（复用统一 dirs 树，不再插 kb_nodes）。
   */
  static async ingestFromZip(args: {
    userId: string
    zip: Buffer
    mountDirId: string
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
        const baseMountDirId = folderSegments.length
          ? (await KbService.ensureDirPath(args.userId, args.mountDirId, folderSegments))
          : args.mountDirId
        if (baseMountDirId == null)
          continue

        const items = await KbService.ingestFiles({
          userId: args.userId,
          files: [{ buffer, filename }],
          mountDirId: baseMountDirId,
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

  /**
   * 沿相对路径段 find-or-create dir 链（复用统一 dirs 树），返回末位 dir id。
   * find 走 dirs 直查；create 走 ProjectService.createDir（kind=dir，须有 project 祖先）。
   * baseParentId 须为已存在 dir/project id；null 时首段无法 create（dir 不可为根）→ 抛错。
   */
  private static async ensureDirPath(
    userId: string,
    baseParentId: string | null,
    segments: string[],
  ): Promise<string | null> {
    let parentId = baseParentId
    for (const seg of segments) {
      if (!seg || seg === '.')
        continue
      if (seg === '..')
        throw new KbConflictError(`invalid folder segment '..' (path escape not allowed)`)
      const cond = parentId == null
        ? and(eq(dirs.userId, userId), isNull(dirs.parentId), eq(dirs.name, seg), eq(dirs.deleted, false))
        : and(eq(dirs.userId, userId), eq(dirs.parentId, parentId), eq(dirs.name, seg), eq(dirs.deleted, false))
      const [found] = await db.select({ id: dirs.id }).from(dirs).where(cond).limit(1)
      if (found) {
        parentId = found.id
        continue
      }
      if (parentId == null)
        throw new KbConflictError('zip 目录须挂到一个已存在的 project/dir 下（无法在根级新建 dir）')
      const created = await ProjectService.createDir(userId, { parentId, name: seg })
      parentId = created.id
    }
    return parentId
  }

  static async ingestText(args: {
    userId: string
    content: string
    name: string
    mountDirId: string
    owner?: string
    tags?: string[]
  }): Promise<KbDoc> {
    const cleaned = cleanMarkdown(args.content, { sourceDocId: 'pending' })
    return KbService.createDraft({
      userId: args.userId,
      mountDirId: args.mountDirId,
      name: args.name,
      content: cleaned,
      ...(args.owner != null ? { owner: args.owner } : {}),
      ...(args.tags ? { tags: args.tags } : {}),
    })
  }

  /**
   * 检索
   * @description 检索知识库，返回检索结果（全局 collection，kbId 仅作分区标签忽略）
   */
  static async query(
    query: string,
    _kbId?: string,
    req?: Omit<KbQueryRequest, 'query' | 'kbId'>,
  ) {
    return retrieveAndRerank(env.KB_COLLECTION, query, {
      skipRerank: req?.options?.skipRerank === true,
      recallK: req?.options?.recallK ?? 60,
    })
  }
}
