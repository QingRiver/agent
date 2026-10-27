import type { EntityRow, LocalIntent } from '@agent/gtd'
import type { SharedTagRow } from '../db/schema/tags'
import { randomUUID } from 'node:crypto'
import { EXPLICIT_STATUS } from '@agent/gtd'
import { setPayloadByDocId } from '@agent/kb'
import { and, eq, inArray, not } from 'drizzle-orm'
import { db } from '../db/drizzle'
import {
  kbDocTags,
  kbDocuments,
  skills,
  skillTags,
  tags,
} from '../db/schema'
import { appendServerIntents, tasksTaggedWith } from '../gtd/txn-log'
import { KbService } from './kb'
import { SkillService } from './skill'

export class TagsConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TagsConflictError'
  }
}

export interface TagDto {
  id: string
  userId: string
  name: string
  color: string | null
  createdAt: Date
  updatedAt: Date | null
}

export interface TagLinkedDoc {
  id: string
  title: string
}

export interface TagLinkedTask {
  id: string
  title: string
}

export interface TagLinkedSkill {
  id: string
  title: string
}

export interface TagDeleteDryRunResult {
  docs: TagLinkedDoc[]
  tasks: TagLinkedTask[]
  skills: TagLinkedSkill[]
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

function isUniqueViolation(err: unknown): boolean {
  const any = err as { code?: string, cause?: { code?: string } }
  return any?.code === '23505' || any?.cause?.code === '23505'
}

function toDto(row: SharedTagRow): TagDto {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    color: row.color,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * 删除标签时对 GTD 的操作：选中的任务移进回收站（已在回收站的跳过），所有任务解绑这个标签。
 * rows 是加锁后的当前状态，只对其中存在的行生成意图。
 */
function tagRemovalIntents(rows: EntityRow[], tagId: string, trashTaskIds: string[]): LocalIntent[] {
  const clientTs = new Date().toISOString()
  const trash = new Set(trashTaskIds)
  const intents: LocalIntent[] = []
  for (const row of rows) {
    if (row.entity === 'task' && trash.has(row.id) && row.data.status !== EXPLICIT_STATUS.DELETED)
      intents.push({ kind: 'command', command: { type: 'delete', id: randomUUID(), clientTs, taskId: row.id } })
  }
  for (const row of rows) {
    if (row.entity === 'task_tag' && row.data.tagId === tagId)
      intents.push({ kind: 'mutation', mutation: { id: randomUUID(), entity: 'task_tag', op: 'delete', entityId: row.id, clientTs } })
  }
  return intents
}

export class TagsService {
  static async list(userId: string): Promise<TagDto[]> {
    const rows = await db
      .select()
      .from(tags)
      .where(and(eq(tags.userId, userId), eq(tags.deleted, false)))
      .orderBy(tags.name)
    return rows.map(toDto)
  }

  static async create(userId: string, args: { name: string, color?: string }): Promise<TagDto> {
    const id = randomUUID()
    const ts = new Date()
    try {
      await db.insert(tags).values({
        id,
        userId,
        name: args.name,
        color: args.color ?? null,
        deleted: false,
        createdAt: ts,
        updatedAt: ts,
      })
    }
    catch (err) {
      if (isUniqueViolation(err))
        throw new TagsConflictError('tag with the same name already exists')
      throw err
    }
    const row = (await db.select().from(tags).where(eq(tags.id, id)).limit(1))[0]!
    return toDto(row)
  }

  static async rename(tagId: string, userId: string, name: string): Promise<{ ok: true } | null> {
    const tag = (await db.select().from(tags).where(eq(tags.id, tagId)).limit(1))[0]
    if (!tag || tag.userId !== userId || tag.deleted)
      return null
    if (tag.name === name)
      return { ok: true }

    const dup = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(
        eq(tags.userId, userId),
        eq(tags.name, name),
        eq(tags.deleted, false),
        not(eq(tags.id, tagId)),
      ))
      .limit(1)
    if (dup[0])
      throw new TagsConflictError('tag with the same name already exists')

    await db
      .update(tags)
      .set({ name, updatedAt: new Date() })
      .where(eq(tags.id, tagId))
    return { ok: true }
  }

  static async updateColor(
    tagId: string,
    userId: string,
    color: string | null,
  ): Promise<TagDto | null> {
    const tag = (await db.select().from(tags).where(eq(tags.id, tagId)).limit(1))[0]
    if (!tag || tag.userId !== userId || tag.deleted)
      return null
    const updated = await db
      .update(tags)
      .set({ color, updatedAt: new Date() })
      .where(eq(tags.id, tagId))
      .returning()
    return updated[0] ? toDto(updated[0]) : null
  }

  /** 按名称确保标签存在（KB ingest 等）；返回 name → id。 */
  static async ensureByNames(userId: string, names: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(names.map(n => n.trim()).filter(Boolean))]
    const result = new Map<string, string>()
    if (!unique.length)
      return result

    const existing = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(and(
        eq(tags.userId, userId),
        eq(tags.deleted, false),
        inArray(tags.name, unique),
      ))
    for (const row of existing)
      result.set(row.name, row.id)

    for (const name of unique) {
      if (result.has(name))
        continue
      const created = await TagsService.create(userId, { name })
      result.set(name, created.id)
    }
    return result
  }

  static async getDocTagIds(docId: string): Promise<string[]> {
    const rows = await db
      .select({ tagId: kbDocTags.tagId })
      .from(kbDocTags)
      .where(eq(kbDocTags.docId, docId))
    return rows.map(r => r.tagId)
  }

  static async setDocTagIds(docId: string, userId: string, tagIds: string[]): Promise<void> {
    const unique = [...new Set(tagIds)]
    if (unique.length) {
      const owned = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(
          eq(tags.userId, userId),
          eq(tags.deleted, false),
          inArray(tags.id, unique),
        ))
      if (owned.length !== unique.length)
        throw new TagsConflictError('one or more tags are invalid or not owned by user')
    }

    await db.transaction(async (tx) => {
      await tx.delete(kbDocTags).where(eq(kbDocTags.docId, docId))
      if (unique.length) {
        await tx.insert(kbDocTags).values(unique.map(tagId => ({ docId, tagId })))
      }
    })
  }

  static async getSkillTagIds(skillId: string): Promise<string[]> {
    const rows = await db
      .select({ tagId: skillTags.tagId })
      .from(skillTags)
      .where(eq(skillTags.skillId, skillId))
    return rows.map(r => r.tagId)
  }

  static async setSkillTagIds(skillId: string, userId: string, tagIds: string[]): Promise<void> {
    const [skill] = await db.select({ id: skills.id }).from(skills).where(and(
      eq(skills.id, skillId),
      eq(skills.userId, userId),
    )).limit(1)
    if (!skill)
      throw new TagsConflictError('skill 不存在或不可见')

    const unique = [...new Set(tagIds)]
    if (unique.length) {
      const owned = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(
          eq(tags.userId, userId),
          eq(tags.deleted, false),
          inArray(tags.id, unique),
        ))
      if (owned.length !== unique.length)
        throw new TagsConflictError('one or more tags are invalid or not owned by user')
    }

    await db.transaction(async (tx) => {
      await tx.delete(skillTags).where(eq(skillTags.skillId, skillId))
      if (unique.length)
        await tx.insert(skillTags).values(unique.map(tagId => ({ skillId, tagId })))
    })
  }

  static async syncQdrantTagIds(kbId: string, docId: string): Promise<void> {
    const tagIds = await TagsService.getDocTagIds(docId)
    await setPayloadByDocId(kbId, docId, { tag_ids: tagIds })
  }

  private static async getLinkedDocs(tagId: string, userId: string): Promise<TagLinkedDoc[]> {
    const rows = await db
      .select({ id: kbDocuments.id, title: kbDocuments.name })
      .from(kbDocTags)
      .innerJoin(kbDocuments, eq(kbDocTags.docId, kbDocuments.id))
      .where(and(eq(kbDocTags.tagId, tagId), eq(kbDocuments.owner, userId)))
    return rows.map(r => ({ id: r.id, title: r.title }))
  }

  private static async getLinkedTasks(tagId: string, userId: string): Promise<(TagLinkedTask & { status: string })[]> {
    const tasks = await tasksTaggedWith(db, userId, tagId)
    return tasks.map(t => ({ id: t.id, title: t.name, status: t.status }))
  }

  private static async getLinkedSkills(tagId: string, userId: string): Promise<TagLinkedSkill[]> {
    const rows = await db
      .select({ id: skills.id, title: skills.code })
      .from(skillTags)
      .innerJoin(skills, eq(skillTags.skillId, skills.id))
      .where(and(eq(skillTags.tagId, tagId), eq(skills.userId, userId)))
    return rows.map(r => ({ id: r.id, title: r.title }))
  }

  private static async syncQdrantForUntaggedDocs(docIds: string[]): Promise<void> {
    if (!docIds.length)
      return
    const docs = await db
      .select({ id: kbDocuments.id, kbId: kbDocuments.kbId })
      .from(kbDocuments)
      .where(and(
        inArray(kbDocuments.id, docIds),
        eq(kbDocuments.indexingStatus, 'completed'),
      ))
    for (const doc of docs)
      await TagsService.syncQdrantTagIds(doc.kbId, doc.id)
  }

  private static async untagAll(userId: string, tagId: string, tx: Tx): Promise<{ docIds: string[] }> {
    const linkedDocs = await tx
      .select({ id: kbDocuments.id })
      .from(kbDocTags)
      .innerJoin(kbDocuments, eq(kbDocTags.docId, kbDocuments.id))
      .where(and(eq(kbDocTags.tagId, tagId), eq(kbDocuments.owner, userId)))

    await tx.delete(kbDocTags).where(eq(kbDocTags.tagId, tagId))

    await appendServerIntents(tx, userId, rows => tagRemovalIntents(rows, tagId, []))

    const skillTagRows = await tx
      .select({ skillId: skillTags.skillId })
      .from(skillTags)
      .innerJoin(skills, eq(skillTags.skillId, skills.id))
      .where(and(eq(skillTags.tagId, tagId), eq(skills.userId, userId)))
    if (skillTagRows.length) {
      await tx.delete(skillTags).where(and(
        eq(skillTags.tagId, tagId),
        inArray(skillTags.skillId, skillTagRows.map(r => r.skillId)),
      ))
    }

    // project defaultTagIds 已弃用（project facet 全删），不再清理

    return { docIds: linkedDocs.map(d => d.id) }
  }

  private static async softDeleteTag(userId: string, tagId: string, tx: Tx): Promise<void> {
    await tx
      .update(tags)
      .set({ deleted: true, updatedAt: new Date() })
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
  }

  static async deleteTag(
    tagId: string,
    userId: string,
    args: {
      mode: 'untag' | 'delete_entities'
      dryRun?: boolean
      docIds?: string[]
      taskIds?: string[]
      skillIds?: string[]
    },
  ): Promise<TagDeleteDryRunResult | { ok: true } | null> {
    const tag = (await db.select().from(tags).where(eq(tags.id, tagId)).limit(1))[0]
    if (!tag || tag.userId !== userId || tag.deleted)
      return null

    const linkedDocs = await TagsService.getLinkedDocs(tagId, userId)
    const linkedTasks = await TagsService.getLinkedTasks(tagId, userId)
    const linkedSkills = await TagsService.getLinkedSkills(tagId, userId)

    if (args.dryRun)
      return { docs: linkedDocs, tasks: linkedTasks.map(t => ({ id: t.id, title: t.title })), skills: linkedSkills }

    if (args.mode === 'untag') {
      let affectedDocIds: string[] = []
      await db.transaction(async (tx) => {
        const untagged = await TagsService.untagAll(userId, tagId, tx)
        affectedDocIds = untagged.docIds
        await TagsService.softDeleteTag(userId, tagId, tx)
      })
      await TagsService.syncQdrantForUntaggedDocs(affectedDocIds)
      return { ok: true }
    }

    // delete_entities
    const linkedDocIdSet = new Set(linkedDocs.map(d => d.id))
    const linkedTaskIdSet = new Set(linkedTasks.map(t => t.id))
    const docIdsToDelete = (args.docIds ?? []).filter(id => linkedDocIdSet.has(id))
    const taskIdsToDelete = (args.taskIds ?? []).filter(id => linkedTaskIdSet.has(id))
    const remainingDocIds = linkedDocs
      .map(d => d.id)
      .filter(id => !docIdsToDelete.includes(id))
    const linkedSkillIdSet = new Set(linkedSkills.map(s => s.id))
    const skillIdsToUnmark = (args.skillIds ?? []).filter(id => linkedSkillIdSet.has(id))
    const remainingSkillIds = linkedSkills
      .map(s => s.id)
      .filter(id => !skillIdsToUnmark.includes(id))

    for (const docId of docIdsToDelete)
      await KbService.removeDoc(docId)

    await db.transaction(async (tx) => {
      await appendServerIntents(tx, userId, rows => tagRemovalIntents(rows, tagId, taskIdsToDelete))

      if (remainingDocIds.length) {
        await tx
          .delete(kbDocTags)
          .where(and(eq(kbDocTags.tagId, tagId), inArray(kbDocTags.docId, remainingDocIds)))
      }

      if (remainingSkillIds.length) {
        await tx.delete(skillTags).where(and(
          eq(skillTags.tagId, tagId),
          inArray(skillTags.skillId, remainingSkillIds),
        ))
      }

      // project defaultTagIds 已弃用（project facet 全删），不再清理

      await TagsService.softDeleteTag(userId, tagId, tx)
    })

    for (const skillId of skillIdsToUnmark)
      await SkillService.unmark(userId, skillId)

    await TagsService.syncQdrantForUntaggedDocs(remainingDocIds)
    return { ok: true }
  }
}
