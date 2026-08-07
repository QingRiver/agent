import type {
  Attachment,
  GtdDocument,
  GtdRepository,
  Perspective,
  RepeatRule,
  Tag,
  Task,
} from '@agent/gtd'
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from '../db/drizzle'
import {
  gtdAttachments,
  gtdPerspectives,
  gtdTasks,
  gtdTaskTags,
  tags,
} from '../db/schema'
import {
  attachmentToRow,
  perspectiveToRow,
  rowToAttachment,
  rowToPerspective,
  rowToRepeatRule,
  rowToTag,
  rowToTask,
  tagToRow,
  taskToRow,
} from './mapper'

const SCHEMA_VERSION = '1'

function aggregateDocMeta(timestamps: string[]): { createdAt: string, updatedAt: string } {
  if (timestamps.length === 0) {
    const now = new Date().toISOString()
    return { createdAt: now, updatedAt: now }
  }
  const ms = timestamps.map(t => new Date(t).getTime())
  return {
    createdAt: new Date(Math.min(...ms)).toISOString(),
    updatedAt: new Date(Math.max(...ms)).toISOString(),
  }
}

function collectDocTimestamps(
  tags: Tag[],
  tasks: Task[],
  attachments: Attachment[],
  perspectives: Perspective[] = [],
): string[] {
  const stamps: string[] = []
  for (const t of tags) {
    stamps.push(t.createdAt)
    if (t.updatedAt)
      stamps.push(t.updatedAt)
  }
  for (const t of tasks) {
    stamps.push(t.createdAt, t.updatedAt)
  }
  for (const a of attachments)
    stamps.push(a.createdAt)
  for (const p of perspectives) {
    stamps.push(p.createdAt)
    if (p.updatedAt)
      stamps.push(p.updatedAt)
  }
  return stamps
}

/**
 * GtdRepository 的 drizzle/node-postgres 实现。
 * - loadDocument: 并行查 7 表，装配 GtdDocument（repeatRules 从 task.repeat_rule jsonb 收集）。
 * - saveDocument: 事务内 SET CONSTRAINTS ALL DEFERRED → 差量删 → upsert 全部（导入用，免拓扑排序）。
 * - 细粒度 saveX/deleteX: 单表 upsert/delete（高频 diff 写）。
 */
export class DrizzleGtdRepository implements GtdRepository {
  async loadDocument(userId: string): Promise<GtdDocument> {
    const [tagRows, perspectives, tasks] = await Promise.all([
      db.select().from(tags).where(and(eq(tags.userId, userId), eq(tags.deleted, false))),
      db.select().from(gtdPerspectives).where(eq(gtdPerspectives.userId, userId)),
      db.select().from(gtdTasks).where(eq(gtdTasks.userId, userId)),
    ])
    const taskIds = tasks.map(t => t.id)
    const [taskTags, attachments] = await Promise.all([
      taskIds.length
        ? db.select().from(gtdTaskTags).where(inArray(gtdTaskTags.taskId, taskIds))
        : Promise.resolve([]),
      taskIds.length
        ? db.select().from(gtdAttachments).where(inArray(gtdAttachments.taskId, taskIds))
        : Promise.resolve([]),
    ])

    const tagIdsByTask = new Map<string, string[]>()
    for (const tt of taskTags) {
      const list = tagIdsByTask.get(tt.taskId) ?? []
      list.push(tt.tagId)
      tagIdsByTask.set(tt.taskId, list)
    }
    const attachmentIdsByTask = new Map<string, string[]>()
    const attachmentEntities: Attachment[] = []
    for (const row of attachments) {
      const a = rowToAttachment(row)
      attachmentEntities.push(a)
      const list = attachmentIdsByTask.get(a.taskId) ?? []
      list.push(a.id)
      attachmentIdsByTask.set(a.taskId, list)
    }
    const repeatRuleMap = new Map<string, RepeatRule>()
    for (const t of tasks) {
      if (t.repeatRule) {
        const rule = rowToRepeatRule(t.repeatRule)
        repeatRuleMap.set(rule.id, rule)
      }
    }
    const taskEntities = tasks.map(row =>
      rowToTask(row, tagIdsByTask.get(row.id) ?? [], attachmentIdsByTask.get(row.id) ?? []),
    )

    const tagEntities = tagRows.map(rowToTag)
    const perspectiveEntities = perspectives.map(rowToPerspective)
    const meta = aggregateDocMeta(collectDocTimestamps(
      tagEntities,
      taskEntities,
      attachmentEntities,
      perspectiveEntities,
    ))

    return {
      version: '1',
      meta: { ...meta, schemaVersion: SCHEMA_VERSION },
      // Phase 1：folder/project 退出 sync（统一 dirs 树在线 API），恒空
      folders: [],
      projects: [],
      tags: tagEntities,
      tasks: taskEntities,
      perspectives: perspectiveEntities,
      repeatRules: [...repeatRuleMap.values()],
      attachments: attachmentEntities,
    }
  }

  async saveDocument(userId: string, doc: GtdDocument): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET CONSTRAINTS ALL DEFERRED`)
      // 差量：删 userId 现有行（CASCADE 清 task_tags/attachments）
      await tx.delete(gtdTasks).where(eq(gtdTasks.userId, userId))
      await tx.delete(gtdPerspectives).where(eq(gtdPerspectives.userId, userId))
      // Phase 1：folder/project 退出 sync（dirs 树在线 API），doc.folders/projects 恒空，跳过
      // tags 为跨域共享表：仅 upsert doc 中的标签，不整表删除
      if (doc.tags.length) {
        for (const tag of doc.tags) {
          const row = tagToRow(tag, userId)
          await tx.insert(tags).values(row).onConflictDoUpdate({
            target: tags.id,
            set: {
              name: row.name,
              color: row.color,
              updatedAt: row.updatedAt,
              deleted: false,
            },
          })
        }
      }
      if (doc.tasks.length) {
        const ruleById = new Map(doc.repeatRules.map(r => [r.id, r] as const))
        await tx.insert(gtdTasks).values(
          doc.tasks.map(t =>
            taskToRow(t, userId, t.repeatRuleId ? (ruleById.get(t.repeatRuleId) ?? null) : null),
          ),
        )
      }
      const ttRows = doc.tasks.flatMap(t => t.tagIds.map(tagId => ({ taskId: t.id, tagId, userId })))
      if (ttRows.length)
        await tx.insert(gtdTaskTags).values(ttRows)
      if (doc.perspectives.length) {
        await tx.insert(gtdPerspectives)
          .values(doc.perspectives.map(p => perspectiveToRow(p, userId)))
      }
      if (doc.attachments.length)
        await tx.insert(gtdAttachments).values(doc.attachments.map(a => attachmentToRow(a, userId)))
    })
  }

  async getTask(userId: string, taskId: string): Promise<Task | null> {
    const [task] = await db
      .select()
      .from(gtdTasks)
      .where(and(eq(gtdTasks.userId, userId), eq(gtdTasks.id, taskId)))
      .limit(1)
    if (!task)
      return null
    const [taskTags, attachments] = await Promise.all([
      db.select().from(gtdTaskTags).where(eq(gtdTaskTags.taskId, taskId)),
      db.select().from(gtdAttachments).where(eq(gtdAttachments.taskId, taskId)),
    ])
    return rowToTask(task, taskTags.map(tt => tt.tagId), attachments.map(a => a.id))
  }

  async saveTask(userId: string, task: Task, repeatRule: RepeatRule | null): Promise<void> {
    const row = taskToRow(task, userId, repeatRule)
    await db.transaction(async (tx) => {
      await tx
        .insert(gtdTasks)
        .values(row)
        .onConflictDoUpdate({
          target: gtdTasks.id,
          set: {
            projectId: row.projectId,
            mountDirId: row.mountDirId,
            parentId: row.parentId,
            name: row.name,
            note: row.note,
            sortOrder: row.sortOrder,
            status: row.status,
            groupType: row.groupType,
            deferDate: row.deferDate,
            dueDate: row.dueDate,
            plannedMode: row.plannedMode,
            plannedDate: row.plannedDate,
            completedAt: row.completedAt,
            droppedAt: row.droppedAt,
            flagged: row.flagged,
            estimateMinutes: row.estimateMinutes,
            repeatRule: row.repeatRule,
            repeatedFromTaskId: row.repeatedFromTaskId,
            updatedAt: row.updatedAt,
          },
        })

      await tx.delete(gtdTaskTags).where(eq(gtdTaskTags.taskId, task.id))
      if (task.tagIds.length) {
        await tx.insert(gtdTaskTags).values(
          task.tagIds.map(tagId => ({ taskId: task.id, tagId, userId })),
        )
      }

      if (task.attachmentIds.length === 0) {
        await tx.delete(gtdAttachments).where(eq(gtdAttachments.taskId, task.id))
      }
      else {
        await tx.delete(gtdAttachments).where(
          and(
            eq(gtdAttachments.taskId, task.id),
            notInArray(gtdAttachments.id, task.attachmentIds),
          ),
        )
      }
    })
  }

  async deleteTask(userId: string, taskId: string): Promise<void> {
    await db
      .delete(gtdTasks)
      .where(and(eq(gtdTasks.userId, userId), eq(gtdTasks.id, taskId)))
  }

  async saveTag(userId: string, tag: Tag): Promise<void> {
    const row = tagToRow(tag, userId)
    await db
      .insert(tags)
      .values(row)
      .onConflictDoUpdate({
        target: tags.id,
        set: {
          name: row.name,
          color: row.color,
          updatedAt: row.updatedAt,
          deleted: false,
        },
      })
  }

  async deleteTag(userId: string, tagId: string): Promise<void> {
    await db
      .update(tags)
      .set({ deleted: true, updatedAt: new Date() })
      .where(and(eq(tags.userId, userId), eq(tags.id, tagId)))
  }

  async savePerspective(userId: string, perspective: Perspective): Promise<void> {
    const row = perspectiveToRow(perspective, userId)
    await db
      .insert(gtdPerspectives)
      .values(row)
      .onConflictDoUpdate({
        target: gtdPerspectives.id,
        set: {
          name: row.name,
          icon: row.icon,
          filter: row.filter,
          groupBy: row.groupBy,
          sortBy: row.sortBy,
          availabilityFilter: row.availabilityFilter,
          showCompleted: row.showCompleted,
          showDropped: row.showDropped,
          flaggedOnly: row.flaggedOnly,
          updatedAt: row.updatedAt,
        },
      })
  }

  async deletePerspective(userId: string, perspectiveId: string): Promise<void> {
    await db
      .delete(gtdPerspectives)
      .where(and(eq(gtdPerspectives.userId, userId), eq(gtdPerspectives.id, perspectiveId)))
  }
}
