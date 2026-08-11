import type {
  GtdRepository,
  Perspective,
  RepeatRule,
  Tag,
  Task,
} from '@agent/gtd'
import { and, eq, notInArray } from 'drizzle-orm'
import { db } from '../db/drizzle'
import {
  gtdAttachments,
  gtdPerspectives,
  gtdTasks,
  gtdTaskTags,
  tags,
} from '../db/schema'
import {
  perspectiveToRow,
  rowToTask,
  tagToRow,
  taskToRow,
} from './mapper'

/**
 * GtdRepository 的 drizzle/node-postgres 实现。
 * 细粒度 saveX/deleteX: 单表 upsert/delete（高频 diff 写）。
 */
export class DrizzleGtdRepository implements GtdRepository {
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
