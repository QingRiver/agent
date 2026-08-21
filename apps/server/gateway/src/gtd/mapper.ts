import type {
  Perspective,
  RepeatRule,
  Tag,
  Task,
} from '@agent/gtd'
import type {
  gtdPerspectives,
  gtdTasks,
  tags,
} from '../db/schema'
import { TaskSchema } from '@agent/gtd'

type TaskRow = typeof gtdTasks.$inferSelect

type TagInsert = typeof tags.$inferInsert
type TaskInsert = typeof gtdTasks.$inferInsert
type PerspectiveInsert = typeof gtdPerspectives.$inferInsert

/** timestamptz(Date) ↔ zod datetime(ISO string) */
const toISO = (d: Date | null): string | null => d?.toISOString() ?? null
const toDate = (s: string | null): Date | null => s ? new Date(s) : null

// ---------- Tag ----------
export function tagToRow(tag: Tag, userId: string): TagInsert {
  return {
    id: tag.id,
    userId,
    name: tag.name,
    color: tag.color,
    deleted: false,
    createdAt: new Date(tag.createdAt),
    updatedAt: toDate(tag.updatedAt),
  }
}

// ---------- Task（标签/附件走独立行；本 mapper 仅 task 列） ----------
export function rowToTask(row: TaskRow): Task {
  const repeatRule = row.repeatRule as RepeatRule | null
  return TaskSchema.parse({
    id: row.id,
    name: row.name,
    note: row.note,
    mountDirId: row.mountDirId,
    parentId: row.parentId,
    order: row.sortOrder,
    status: row.status,
    groupType: row.groupType,
    deferDate: toISO(row.deferDate),
    dueDate: toISO(row.dueDate),
    plannedMode: row.plannedMode ?? 'none',
    plannedDate: toISO(row.plannedDate),
    completedAt: toISO(row.completedAt),
    heldAt: toISO(row.heldAt),
    droppedAt: toISO(row.droppedAt),
    flagged: row.flagged,
    estimateMinutes: row.estimateMinutes,
    repeatRuleId: repeatRule?.id ?? null,
    repeatedFromTaskId: row.repeatedFromTaskId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: (row.updatedAt ?? row.createdAt).toISOString(),
  })
}

export function taskToRow(task: Task, userId: string, repeatRule: RepeatRule | null): TaskInsert {
  return {
    id: task.id,
    userId,
    mountDirId: task.mountDirId,
    parentId: task.parentId,
    name: task.name,
    note: task.note,
    sortOrder: task.order,
    status: task.status,
    groupType: task.groupType,
    deferDate: toDate(task.deferDate),
    dueDate: toDate(task.dueDate),
    plannedMode: task.plannedMode,
    plannedDate: toDate(task.plannedDate),
    completedAt: toDate(task.completedAt),
    heldAt: toDate(task.heldAt),
    droppedAt: toDate(task.droppedAt),
    flagged: task.flagged,
    estimateMinutes: task.estimateMinutes,
    repeatRule,
    repeatedFromTaskId: task.repeatedFromTaskId,
    createdAt: new Date(task.createdAt),
    updatedAt: new Date(task.updatedAt),
  }
}

// ---------- Perspective ----------
export function perspectiveToRow(p: Perspective, userId: string): PerspectiveInsert {
  return {
    id: p.id,
    userId,
    name: p.name,
    icon: p.icon,
    filter: p.filter,
    groupBy: p.groupBy,
    sortBy: p.sortBy,
    createdAt: new Date(p.createdAt),
    updatedAt: toDate(p.updatedAt),
  }
}
