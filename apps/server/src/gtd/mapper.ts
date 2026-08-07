import type {
  Attachment,
  Perspective,
  RepeatRule,
  Tag,
  Task,
} from '@agent/gtd'
import type {
  gtdAttachments,
  gtdPerspectives,
  gtdTasks,
  tags,
} from '../db/schema'
import {
  AttachmentSchema,
  PerspectiveSchema,
  RepeatRuleSchema,
  TagSchema,
  TaskSchema,
} from '@agent/gtd'

type TagRow = typeof tags.$inferSelect
type TaskRow = typeof gtdTasks.$inferSelect
type PerspectiveRow = typeof gtdPerspectives.$inferSelect
type AttachmentRow = typeof gtdAttachments.$inferSelect

type TagInsert = typeof tags.$inferInsert
type TaskInsert = typeof gtdTasks.$inferInsert
type PerspectiveInsert = typeof gtdPerspectives.$inferInsert
type AttachmentInsert = typeof gtdAttachments.$inferInsert

/** timestamptz(Date) ↔ zod datetime(ISO string) */
const toISO = (d: Date | null): string | null => d?.toISOString() ?? null
const toDate = (s: string | null): Date | null => s ? new Date(s) : null

// ---------- Tag ----------
export function rowToTag(row: TagRow): Tag {
  return TagSchema.parse({
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.createdAt.toISOString(),
    updatedAt: toISO(row.updatedAt),
  })
}

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

// ---------- RepeatRule（内联 task.repeat_rule jsonb，无独立表） ----------
export function rowToRepeatRule(jsonb: unknown): RepeatRule {
  return RepeatRuleSchema.parse(jsonb)
}

// ---------- Task（repeatRuleId ↔ repeat_rule jsonb；tagIds/attachmentIds 装配） ----------
export function rowToTask(row: TaskRow, tagIds: string[], attachmentIds: string[]): Task {
  const repeatRule = row.repeatRule as RepeatRule | null
  return TaskSchema.parse({
    id: row.id,
    name: row.name,
    note: row.note,
    projectId: row.projectId,
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
    droppedAt: toISO(row.droppedAt),
    flagged: row.flagged,
    estimateMinutes: row.estimateMinutes,
    repeatRuleId: repeatRule?.id ?? null,
    tagIds,
    attachmentIds,
    repeatedFromTaskId: row.repeatedFromTaskId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: (row.updatedAt ?? row.createdAt).toISOString(),
  })
}

export function taskToRow(task: Task, userId: string, repeatRule: RepeatRule | null): TaskInsert {
  return {
    id: task.id,
    userId,
    projectId: task.projectId,
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
    droppedAt: toDate(task.droppedAt),
    flagged: task.flagged,
    estimateMinutes: task.estimateMinutes,
    repeatRule,
    repeatedFromTaskId: task.repeatedFromTaskId,
    createdAt: new Date(task.createdAt),
    updatedAt: new Date(task.updatedAt),
  }
}

// ---------- Perspective（filter/sort_by jsonb；group_by text[]） ----------
export function rowToPerspective(row: PerspectiveRow): Perspective {
  return PerspectiveSchema.parse({
    id: row.id,
    name: row.name,
    icon: row.icon,
    filter: row.filter as Perspective['filter'],
    groupBy: row.groupBy ?? [],
    sortBy: row.sortBy as Perspective['sortBy'],
    availabilityFilter: row.availabilityFilter,
    showCompleted: row.showCompleted,
    showDropped: row.showDropped,
    flaggedOnly: row.flaggedOnly,
    createdAt: row.createdAt.toISOString(),
    updatedAt: toISO(row.updatedAt),
  })
}

export function perspectiveToRow(p: Perspective, userId: string): PerspectiveInsert {
  return {
    id: p.id,
    userId,
    name: p.name,
    icon: p.icon,
    filter: p.filter,
    groupBy: p.groupBy,
    sortBy: p.sortBy,
    availabilityFilter: p.availabilityFilter,
    showCompleted: p.showCompleted,
    showDropped: p.showDropped,
    flaggedOnly: p.flaggedOnly,
    createdAt: new Date(p.createdAt),
    updatedAt: toDate(p.updatedAt),
  }
}

// ---------- Attachment ----------
export function rowToAttachment(row: AttachmentRow): Attachment {
  return AttachmentSchema.parse({
    id: row.id,
    taskId: row.taskId,
    kind: row.kind,
    url: row.url,
    filename: row.filename,
    createdAt: row.createdAt.toISOString(),
  })
}

export function attachmentToRow(a: Attachment, userId: string): AttachmentInsert {
  return {
    id: a.id,
    userId,
    taskId: a.taskId,
    kind: a.kind,
    url: a.url,
    filename: a.filename,
    createdAt: new Date(a.createdAt),
  }
}
