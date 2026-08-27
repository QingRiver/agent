import {
  canonicalSkillCode,
  formatSkillContext,
  isReservedSkillCode,
  parseFrontmatter,
  SKILL_ENTRY_FILENAME,
  slugifySkillCode,
} from '@agent/proto'
import { and, eq, inArray } from 'drizzle-orm'
import { invalidateAgentConfigCache } from '../agent/agentConfig/store'
import { db } from '../db/drizzle'
import { agentConfigs, dirs, gtdTasks, kbDocuments, kbs, skills, skillTags, versionTexts } from '../db/schema'

export class SkillConflictError extends Error {
  readonly status: 400 | 409
  constructor(message: string, status: 400 | 409 = 409) {
    super(message)
    this.name = 'SkillConflictError'
    this.status = status
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type DbOrTx = Tx | typeof db

export interface SkillDto {
  id: string
  userId: string
  dirId: string
  code: string
  status: 'usable' | 'offline'
  dirName: string
  vdir: string
  tagIds: string[]
  createdAt: string
  updatedAt: string | null
}

export interface VersionTextDto {
  id: string
  userId: string
  mountDirId: string
  filename: string
  content: string
  updatedAt: string | null
}

export interface SkillBinding {
  code: string
  name: string
  strategy: 'latest'
}

function now(): Date {
  return new Date()
}

async function loadLiveDir(userId: string, dirId: string, tx?: DbOrTx) {
  const client = tx ?? db
  const [row] = await client.select().from(dirs).where(and(
    eq(dirs.id, dirId),
    eq(dirs.userId, userId),
    eq(dirs.deleted, false),
  )).limit(1)
  if (!row)
    throw new SkillConflictError('dir 不存在或不可见')
  return row
}

export async function loadLiveDirs(userId: string, tx?: DbOrTx) {
  const client = tx ?? db
  return client.select().from(dirs).where(and(eq(dirs.userId, userId), eq(dirs.deleted, false)))
}

export function subtreeIdsOf(all: { id: string, parentId: string | null }[], rootId: string): string[] {
  const children = new Map<string, string[]>()
  for (const d of all) {
    if (d.parentId == null)
      continue
    const list = children.get(d.parentId) ?? []
    list.push(d.id)
    children.set(d.parentId, list)
  }
  const ids: string[] = []
  const stack = [rootId]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const cur = stack.pop()!
    if (seen.has(cur))
      continue
    seen.add(cur)
    ids.push(cur)
    for (const c of children.get(cur) ?? [])
      stack.push(c)
  }
  return ids
}

export function ancestorIdsOf(all: { id: string, parentId: string | null }[], dirId: string): string[] {
  const byId = new Map(all.map(d => [d.id, d]))
  const ids: string[] = []
  let cur = byId.get(dirId)
  const seen = new Set<string>()
  while (cur) {
    if (seen.has(cur.id))
      break
    seen.add(cur.id)
    ids.push(cur.id)
    cur = cur.parentId != null ? byId.get(cur.parentId) : undefined
  }
  return ids
}

function relativeSkillPath(rootVdir: string, mountVdir: string, filename: string): string {
  if (mountVdir === rootVdir)
    return filename
  const prefix = `${rootVdir}/`
  if (mountVdir.startsWith(prefix))
    return `${mountVdir.slice(prefix.length)}/${filename}`
  return filename
}

function assertFilename(filename: string): void {
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..'))
    throw new SkillConflictError('filename 不能包含路径分隔或 ..', 400)
  if (!filename.trim())
    throw new SkillConflictError('filename 不能为空', 400)
}

async function subtreeHasKbOrTask(userId: string, subtreeIds: string[], tx?: DbOrTx): Promise<boolean> {
  const client = tx ?? db
  const [doc] = await client.select({ id: kbDocuments.id }).from(kbDocuments).where(and(
    eq(kbDocuments.userId, userId),
    inArray(kbDocuments.mountDirId, subtreeIds),
  )).limit(1)
  if (doc)
    return true
  const [task] = await client.select({ id: gtdTasks.id }).from(gtdTasks).where(and(
    eq(gtdTasks.userId, userId),
    inArray(gtdTasks.mountDirId, subtreeIds),
    eq(gtdTasks.deleted, false),
  )).limit(1)
  return !!task
}

async function skillRowsIn(userId: string, dirIds: string[], tx?: DbOrTx) {
  if (dirIds.length === 0)
    return []
  const client = tx ?? db
  return client.select().from(skills).where(and(
    eq(skills.userId, userId),
    inArray(skills.dirId, dirIds),
  ))
}

async function kbRowsIn(userId: string, dirIds: string[], tx?: DbOrTx) {
  if (dirIds.length === 0)
    return []
  const client = tx ?? db
  return client.select().from(kbs).where(and(
    eq(kbs.userId, userId),
    inArray(kbs.dirId, dirIds),
  ))
}

/** dir 自身或祖先是否落在某个 skill 子树内；返回该 skill 根 dirId */
export async function findEnclosingSkillDirId(userId: string, dirId: string, tx?: DbOrTx): Promise<string | null> {
  const all = await loadLiveDirs(userId, tx)
  const chain = ancestorIdsOf(all, dirId)
  if (chain.length === 0)
    return null
  const rows = await skillRowsIn(userId, chain, tx)
  const byDir = new Map(rows.map(r => [r.dirId, r]))
  for (const id of chain) {
    if (byDir.has(id))
      return id
  }
  return null
}

export async function assertNotSkillSubtree(userId: string, dirId: string | null | undefined): Promise<void> {
  if (dirId == null)
    return
  const enclosed = await findEnclosingSkillDirId(userId, dirId)
  if (enclosed)
    throw new SkillConflictError('skill 子树禁止挂载 kb / task')
}

export async function assertMoveAllowed(userId: string, movingId: string, newParentId: string): Promise<void> {
  const destEnclosing = await findEnclosingSkillDirId(userId, newParentId)
  if (!destEnclosing)
    return
  const all = await loadLiveDirs(userId)
  const movingSubtree = subtreeIdsOf(all, movingId)
  if (await subtreeHasKbOrTask(userId, movingSubtree))
    throw new SkillConflictError('不能把含 kb/task 的目录移入 skill 子树')
  const nested = await skillRowsIn(userId, movingSubtree)
  if (nested.some(s => s.dirId !== destEnclosing))
    throw new SkillConflictError('禁止把 skill 嵌套进另一个 skill')
}

/** 中文文件夹名 slug 会变成空，旧逻辑一律落到 `skill`，新建多个文件夹会撞唯一约束。 */
function allocateSkillCode(dirId: string, dirName: string, requested?: string): string {
  const slug = slugifySkillCode(dirName)
  const requestedCode = requested?.trim()
  const literalSkill = dirName.trim().toLowerCase() === 'skill'
  if (requestedCode && !(requestedCode === 'skill' && !literalSkill))
    return requestedCode.slice(0, 64)
  if (slug && slug !== 'skill')
    return slug.slice(0, 64)
  if (literalSkill)
    return 'skill'
  return `s_${dirId.replace(/-/g, '').slice(0, 16)}`.slice(0, 64)
}

async function retargetAgentSkillCodes(userId: string, from: string, to: string): Promise<void> {
  if (from === to)
    return
  const rows = await db.select({
    id: agentConfigs.id,
    skillCodes: agentConfigs.skillCodes,
  }).from(agentConfigs).where(eq(agentConfigs.userId, userId))
  for (const row of rows) {
    if (!row.skillCodes.includes(from))
      continue
    const skillCodes = row.skillCodes.map(c => c === from ? to : c)
    await db.update(agentConfigs).set({
      skillCodes,
      updatedAt: Date.now(),
    }).where(eq(agentConfigs.id, row.id))
    invalidateAgentConfigCache(userId, row.id)
  }
}

/** SKILL.md frontmatter name 是唯一标识；合法 slug 时把 skills.code 同步过去。 */
async function syncSkillCodeFromEntry(userId: string, dirId: string, content: string): Promise<void> {
  const name = parseFrontmatter(content).name?.trim()
  if (!name)
    return
  const next = canonicalSkillCode(name)
  if (!next)
    return
  const [row] = await db.select().from(skills).where(and(
    eq(skills.userId, userId),
    eq(skills.dirId, dirId),
  )).limit(1)
  if (!row || row.code === next)
    return
  const [dup] = await db.select({ id: skills.id }).from(skills).where(and(
    eq(skills.userId, userId),
    eq(skills.code, next),
  )).limit(1)
  if (dup)
    throw new SkillConflictError(`skill_code 已存在: ${next}`)
  await db.update(skills).set({
    code: next,
    updatedAt: now(),
  }).where(eq(skills.id, row.id))
  await retargetAgentSkillCodes(userId, row.code, next)
}

function toSkillDto(
  row: typeof skills.$inferSelect,
  dir: { name: string, vdir: string },
  tagIds: string[] = [],
): SkillDto {
  return {
    id: row.id,
    userId: row.userId,
    dirId: row.dirId,
    code: row.code,
    status: row.status as SkillDto['status'],
    dirName: dir.name,
    vdir: dir.vdir,
    tagIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  }
}

function toTextDto(row: typeof versionTexts.$inferSelect): VersionTextDto {
  return {
    id: row.id,
    userId: row.userId,
    mountDirId: row.mountDirId,
    filename: row.filename,
    content: row.content,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  }
}

export class SkillService {
  static async list(userId: string): Promise<SkillDto[]> {
    const rows = await db.select().from(skills).where(eq(skills.userId, userId))
    if (rows.length === 0)
      return []
    const dirRows = await db.select().from(dirs).where(and(
      eq(dirs.userId, userId),
      inArray(dirs.id, rows.map(r => r.dirId)),
      eq(dirs.deleted, false),
    ))
    const dirById = new Map(dirRows.map(d => [d.id, d]))
    const tagRows = await db.select().from(skillTags).where(inArray(skillTags.skillId, rows.map(r => r.id)))
    const tagIdsBySkill = new Map<string, string[]>()
    for (const t of tagRows) {
      const list = tagIdsBySkill.get(t.skillId) ?? []
      list.push(t.tagId)
      tagIdsBySkill.set(t.skillId, list)
    }
    const out: SkillDto[] = []
    for (const r of rows) {
      const dir = dirById.get(r.dirId)
      if (!dir)
        continue
      out.push(toSkillDto(r, dir, tagIdsBySkill.get(r.id) ?? []))
    }
    return out
  }

  static async create(userId: string, input: { dirId: string, code?: string }): Promise<SkillDto> {
    const dir = await loadLiveDir(userId, input.dirId)
    if (dir.kind !== 'dir')
      throw new SkillConflictError('只能把 kind=dir 打成 skill', 400)
    const all = await loadLiveDirs(userId)
    const ancestors = ancestorIdsOf(all, dir.id).filter(id => id !== dir.id)
    if ((await skillRowsIn(userId, ancestors)).length > 0)
      throw new SkillConflictError('禁止嵌套 skill')
    const [existing] = await db.select().from(skills).where(eq(skills.dirId, dir.id)).limit(1)
    if (existing)
      throw new SkillConflictError('该 dir 已是 skill')
    const subtree = subtreeIdsOf(all, dir.id)
    if (await subtreeHasKbOrTask(userId, subtree))
      throw new SkillConflictError('已有 kb/task 的 dir 不能打成 skill')
    // 子树内若已存在后代 skill，禁止再标记当前 dir（防祖先-后代嵌套，与 move 的 assertMoveAllowed 对齐）
    if ((await skillRowsIn(userId, subtree)).length > 0)
      throw new SkillConflictError('禁止嵌套 skill')
    if ((await kbRowsIn(userId, ancestorIdsOf(all, dir.id))).length > 0)
      throw new SkillConflictError('禁止在知识库子树内创建 skill')
    if ((await kbRowsIn(userId, subtree)).length > 0)
      throw new SkillConflictError('禁止把含知识库的目录打成 skill')
    const code = allocateSkillCode(dir.id, dir.name, input.code)
    if (isReservedSkillCode(code))
      throw new SkillConflictError(`skill_code 为保留名: ${code}`, 400)
    const [dup] = await db.select().from(skills).where(and(eq(skills.userId, userId), eq(skills.code, code))).limit(1)
    if (dup)
      throw new SkillConflictError(`skill_code 已存在: ${code}`)
    const id = crypto.randomUUID()
    const ts = now()
    await db.insert(skills).values({
      id,
      userId,
      dirId: dir.id,
      code,
      status: 'usable',
      createdAt: ts,
      updatedAt: ts,
    })
    const [row] = await db.select().from(skills).where(eq(skills.id, id)).limit(1)
    return toSkillDto(row!, dir)
  }

  /** P0 卸标：删 skills 行 + 硬删子树 version_text，dirs 保留 */
  static async unmark(userId: string, skillId: string): Promise<void> {
    const [row] = await db.select().from(skills).where(and(eq(skills.id, skillId), eq(skills.userId, userId))).limit(1)
    if (!row)
      throw new SkillConflictError('skill 不存在或不可见')
    const all = await loadLiveDirs(userId)
    const subtree = subtreeIdsOf(all, row.dirId)
    await db.transaction(async (tx) => {
      await tx.delete(skillTags).where(eq(skillTags.skillId, skillId))
      if (subtree.length > 0) {
        await tx.delete(versionTexts).where(and(
          eq(versionTexts.userId, userId),
          inArray(versionTexts.mountDirId, subtree),
        ))
      }
      await tx.delete(skills).where(eq(skills.id, skillId))
    })
  }

  static async walkFiles(userId: string, skillCode: string): Promise<Record<string, string> | null> {
    const [skill] = await db.select().from(skills).where(and(
      eq(skills.userId, userId),
      eq(skills.code, skillCode),
    )).limit(1)
    if (!skill || skill.status !== 'usable')
      return null
    const all = await loadLiveDirs(userId)
    const root = all.find(d => d.id === skill.dirId)
    if (!root)
      return null
    const subtree = subtreeIdsOf(all, skill.dirId)
    if (subtree.length === 0)
      return {}
    const texts = await db.select().from(versionTexts).where(and(
      eq(versionTexts.userId, userId),
      inArray(versionTexts.mountDirId, subtree),
    ))
    const dirById = new Map(all.map(d => [d.id, d]))
    const files: Record<string, string> = {}
    for (const t of texts) {
      const mount = dirById.get(t.mountDirId)
      if (!mount)
        continue
      files[relativeSkillPath(root.vdir, mount.vdir, t.filename)] = t.content
    }
    return files
  }

  static async buildIndex(userId: string, skillCodes: string[]): Promise<{
    skillText: string
    skillBindings: SkillBinding[]
  }> {
    const codes = [...new Set(skillCodes.map(c => c.trim()).filter(Boolean))]
    if (codes.length === 0)
      return { skillText: '', skillBindings: [] }
    const rows = await db.select().from(skills).where(and(
      eq(skills.userId, userId),
      inArray(skills.code, codes),
    ))
    const usable = rows.filter(r => r.status === 'usable')
    const dirRows = usable.length > 0
      ? await db.select().from(dirs).where(and(
          eq(dirs.userId, userId),
          inArray(dirs.id, usable.map(r => r.dirId)),
          eq(dirs.deleted, false),
        ))
      : []
    const dirById = new Map(dirRows.map(d => [d.id, d]))
    const entries: { name: string, code: string, description: string }[] = []
    const bindings: SkillBinding[] = []
    for (const s of usable) {
      const dir = dirById.get(s.dirId)
      if (!dir)
        continue
      const [md] = await db.select().from(versionTexts).where(and(
        eq(versionTexts.userId, userId),
        eq(versionTexts.mountDirId, s.dirId),
        eq(versionTexts.filename, SKILL_ENTRY_FILENAME),
      )).limit(1)
      const fm = parseFrontmatter(md?.content ?? '')
      const name = fm.name?.trim() || dir.name
      entries.push({
        name,
        code: s.code,
        description: fm.description ?? '',
      })
      bindings.push({ code: s.code, name, strategy: 'latest' })
    }
    return { skillText: formatSkillContext(entries), skillBindings: bindings }
  }

  static async listVersionTexts(userId: string, mountDirId: string): Promise<VersionTextDto[]> {
    await loadLiveDir(userId, mountDirId)
    const rows = await db.select().from(versionTexts).where(and(
      eq(versionTexts.userId, userId),
      eq(versionTexts.mountDirId, mountDirId),
    ))
    return rows.map(toTextDto)
  }

  static async listAllVersionTexts(userId: string): Promise<VersionTextDto[]> {
    const rows = await db.select().from(versionTexts).where(eq(versionTexts.userId, userId))
    return rows.map(toTextDto)
  }

  static async upsertVersionText(userId: string, input: {
    dirId: string
    filename: string
    content: string
  }): Promise<VersionTextDto> {
    assertFilename(input.filename)
    await loadLiveDir(userId, input.dirId)
    const all = await loadLiveDirs(userId)
    if ((await kbRowsIn(userId, ancestorIdsOf(all, input.dirId))).length > 0)
      throw new SkillConflictError('知识库子树禁止挂 skill 文本')
    const ts = now()
    const [existing] = await db.select().from(versionTexts).where(and(
      eq(versionTexts.userId, userId),
      eq(versionTexts.mountDirId, input.dirId),
      eq(versionTexts.filename, input.filename),
    )).limit(1)
    if (existing) {
      const [updated] = await db.update(versionTexts).set({
        content: input.content,
        updatedAt: ts,
      }).where(eq(versionTexts.id, existing.id)).returning()
      if (input.filename === SKILL_ENTRY_FILENAME)
        await syncSkillCodeFromEntry(userId, input.dirId, input.content)
      return toTextDto(updated!)
    }
    const id = crypto.randomUUID()
    await db.insert(versionTexts).values({
      id,
      userId,
      mountDirId: input.dirId,
      filename: input.filename,
      content: input.content,
      updatedAt: ts,
    })
    const [row] = await db.select().from(versionTexts).where(eq(versionTexts.id, id)).limit(1)
    if (input.filename === SKILL_ENTRY_FILENAME)
      await syncSkillCodeFromEntry(userId, input.dirId, input.content)
    return toTextDto(row!)
  }

  static async deleteVersionText(userId: string, id: string): Promise<void> {
    const [row] = await db.select().from(versionTexts).where(and(
      eq(versionTexts.id, id),
      eq(versionTexts.userId, userId),
    )).limit(1)
    if (!row)
      throw new SkillConflictError('version_text 不存在或不可见')
    await db.delete(versionTexts).where(eq(versionTexts.id, id))
  }

  static async hasVersionTextMount(userId: string, dirId: string, tx?: DbOrTx): Promise<boolean> {
    const client = tx ?? db
    const [row] = await client.select({ id: versionTexts.id }).from(versionTexts).where(and(
      eq(versionTexts.userId, userId),
      eq(versionTexts.mountDirId, dirId),
    )).limit(1)
    return !!row
  }
}
