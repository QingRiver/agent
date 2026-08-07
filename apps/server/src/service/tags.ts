import type { SharedTagRow } from '../db/schema/tags'
import { randomUUID } from 'node:crypto'
import { setPayloadByDocId } from '@agent/kb'
import { and, eq, inArray, not } from 'drizzle-orm'
import { db } from '../db/drizzle'
import {
  gtdSyncClocks,
  gtdTasks,
  gtdTaskTags,
  kbDocTags,
  kbDocuments,
  tags,
} from '../db/schema'
import { KbService } from './kb'

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

export interface TagDeleteDryRunResult {
  docs: TagLinkedDoc[]
  tasks: TagLinkedTask[]
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

async function allocateSyncIds(userId: string, count: number, tx: Tx): Promise<number[]> {
  if (count <= 0)
    return []
  await tx.insert(gtdSyncClocks).values({ userId, clock: 0 }).onConflictDoNothing()
  const clockRow = await tx.select().from(gtdSyncClocks).where(eq(gtdSyncClocks.userId, userId)).for('update')
  const oldClock = clockRow[0]?.clock ?? 0
  const ids = Array.from({ length: count }, (_, i) => oldClock + i + 1)
  await tx
    .update(gtdSyncClocks)
    .set({ clock: oldClock + count, updatedAt: new Date() })
    .where(eq(gtdSyncClocks.userId, userId))
  return ids
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
      await db.transaction(async (tx) => {
        const [syncId] = await allocateSyncIds(userId, 1, tx)
        await tx.insert(tags).values({
          id,
          userId,
          name: args.name,
          color: args.color ?? null,
          syncId,
          deleted: false,
          createdAt: ts,
          updatedAt: ts,
        })
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

  private static async getLinkedTasks(tagId: string, userId: string): Promise<TagLinkedTask[]> {
    const rows = await db
      .select({ id: gtdTasks.id, title: gtdTasks.name })
      .from(gtdTaskTags)
      .innerJoin(gtdTasks, eq(gtdTaskTags.taskId, gtdTasks.id))
      .where(and(
        eq(gtdTaskTags.tagId, tagId),
        eq(gtdTaskTags.userId, userId),
        eq(gtdTaskTags.deleted, false),
        eq(gtdTasks.userId, userId),
        eq(gtdTasks.deleted, false),
      ))
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

    const taskTagRows = await tx
      .select({ taskId: gtdTaskTags.taskId, tagId: gtdTaskTags.tagId })
      .from(gtdTaskTags)
      .where(and(
        eq(gtdTaskTags.tagId, tagId),
        eq(gtdTaskTags.userId, userId),
        eq(gtdTaskTags.deleted, false),
      ))

    if (taskTagRows.length) {
      const syncIds = await allocateSyncIds(userId, taskTagRows.length, tx)
      for (let i = 0; i < taskTagRows.length; i++) {
        const row = taskTagRows[i]!
        await tx
          .update(gtdTaskTags)
          .set({ deleted: true, syncId: syncIds[i] })
          .where(and(
            eq(gtdTaskTags.taskId, row.taskId),
            eq(gtdTaskTags.tagId, row.tagId),
          ))
      }
    }

    // Phase 1：project defaultTagIds 已弃用（project facet 全删），不再清理

    return { docIds: linkedDocs.map(d => d.id) }
  }

  private static async softDeleteTag(userId: string, tagId: string, tx: Tx): Promise<void> {
    const [syncId] = await allocateSyncIds(userId, 1, tx)
    await tx
      .update(tags)
      .set({ deleted: true, syncId, updatedAt: new Date() })
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
    },
  ): Promise<TagDeleteDryRunResult | { ok: true } | null> {
    const tag = (await db.select().from(tags).where(eq(tags.id, tagId)).limit(1))[0]
    if (!tag || tag.userId !== userId || tag.deleted)
      return null

    const linkedDocs = await TagsService.getLinkedDocs(tagId, userId)
    const linkedTasks = await TagsService.getLinkedTasks(tagId, userId)

    if (args.dryRun)
      return { docs: linkedDocs, tasks: linkedTasks }

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

    for (const docId of docIdsToDelete)
      await KbService.removeDoc(docId)

    await db.transaction(async (tx) => {
      if (taskIdsToDelete.length) {
        const syncIds = await allocateSyncIds(userId, taskIdsToDelete.length, tx)
        for (let i = 0; i < taskIdsToDelete.length; i++) {
          const taskId = taskIdsToDelete[i]!
          await tx
            .update(gtdTasks)
            .set({ deleted: true, syncId: syncIds[i], updatedAt: new Date() })
            .where(and(eq(gtdTasks.id, taskId), eq(gtdTasks.userId, userId)))

          const ttRows = await tx
            .select({ taskId: gtdTaskTags.taskId, tagId: gtdTaskTags.tagId })
            .from(gtdTaskTags)
            .where(and(
              eq(gtdTaskTags.taskId, taskId),
              eq(gtdTaskTags.userId, userId),
              eq(gtdTaskTags.deleted, false),
            ))
          if (ttRows.length) {
            const ttSyncIds = await allocateSyncIds(userId, ttRows.length, tx)
            for (let j = 0; j < ttRows.length; j++) {
              const row = ttRows[j]!
              await tx
                .update(gtdTaskTags)
                .set({ deleted: true, syncId: ttSyncIds[j] })
                .where(and(
                  eq(gtdTaskTags.taskId, row.taskId),
                  eq(gtdTaskTags.tagId, row.tagId),
                ))
            }
          }
        }
      }

      if (remainingDocIds.length) {
        await tx
          .delete(kbDocTags)
          .where(and(eq(kbDocTags.tagId, tagId), inArray(kbDocTags.docId, remainingDocIds)))
      }

      const remainingTaskIds = linkedTasks
        .map(t => t.id)
        .filter(id => !taskIdsToDelete.includes(id))
      if (remainingTaskIds.length) {
        const ttRows = await tx
          .select({ taskId: gtdTaskTags.taskId, tagId: gtdTaskTags.tagId })
          .from(gtdTaskTags)
          .where(and(
            eq(gtdTaskTags.tagId, tagId),
            eq(gtdTaskTags.userId, userId),
            eq(gtdTaskTags.deleted, false),
            inArray(gtdTaskTags.taskId, remainingTaskIds),
          ))
        if (ttRows.length) {
          const syncIds = await allocateSyncIds(userId, ttRows.length, tx)
          for (let i = 0; i < ttRows.length; i++) {
            const row = ttRows[i]!
            await tx
              .update(gtdTaskTags)
              .set({ deleted: true, syncId: syncIds[i] })
              .where(and(
                eq(gtdTaskTags.taskId, row.taskId),
                eq(gtdTaskTags.tagId, row.tagId),
              ))
          }
        }
      }

      // Phase 1：project defaultTagIds 已弃用（project facet 全删），不再清理

      await TagsService.softDeleteTag(userId, tagId, tx)
    })

    await TagsService.syncQdrantForUntaggedDocs(remainingDocIds)
    return { ok: true }
  }
}
