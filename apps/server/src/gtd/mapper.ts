import type {
  Attachment,
  Folder,
  Perspective,
  Project,
  RepeatRule,
  ReviewConfig,
  Tag,
  Task,
} from '@agent/gtd'
import type {
  gtdAttachments,
  gtdFolders,
  gtdPerspectives,
  gtdProjects,
  gtdTags,
  gtdTasks,
} from '../db/schema'
import {
  AttachmentSchema,
  FolderSchema,
  PerspectiveSchema,
  ProjectSchema,
  RepeatRuleSchema,
  TagSchema,
  TaskSchema,
} from '@agent/gtd'

type FolderRow = typeof gtdFolders.$inferSelect
type TagRow = typeof gtdTags.$inferSelect
type ProjectRow = typeof gtdProjects.$inferSelect
type TaskRow = typeof gtdTasks.$inferSelect
type PerspectiveRow = typeof gtdPerspectives.$inferSelect
type AttachmentRow = typeof gtdAttachments.$inferSelect

type FolderInsert = typeof gtdFolders.$inferInsert
type TagInsert = typeof gtdTags.$inferInsert
type ProjectInsert = typeof gtdProjects.$inferInsert
type TaskInsert = typeof gtdTasks.$inferInsert
type PerspectiveInsert = typeof gtdPerspectives.$inferInsert
type AttachmentInsert = typeof gtdAttachments.$inferInsert

/** timestamptz(Date) ↔ zod datetime(ISO string) */
const toISO = (d: Date | null): string | null => d?.toISOString() ?? null
const toDate = (s: string | null): Date | null => s ? new Date(s) : null

// ---------- Folder ----------
export function rowToFolder(row: FolderRow): Folder {
  return FolderSchema.parse({
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    order: row.sortOrder,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: toISO(row.updatedAt),
  })
}

export function folderToRow(folder: Folder, userId: string): FolderInsert {
  return {
    id: folder.id,
    userId,
    parentId: folder.parentId,
    name: folder.name,
    sortOrder: folder.order,
    status: folder.status,
    createdAt: new Date(folder.createdAt),
    updatedAt: toDate(folder.updatedAt),
  }
}

// ---------- Tag ----------
export function rowToTag(row: TagRow): Tag {
  return TagSchema.parse({
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    order: row.sortOrder,
    color: row.color,
    createdAt: row.createdAt.toISOString(),
    updatedAt: toISO(row.updatedAt),
  })
}

export function tagToRow(tag: Tag, userId: string): TagInsert {
  return {
    id: tag.id,
    userId,
    parentId: tag.parentId,
    name: tag.name,
    color: tag.color,
    sortOrder: tag.order,
    createdAt: new Date(tag.createdAt),
    updatedAt: toDate(tag.updatedAt),
  }
}

// ---------- RepeatRule（内联 task.repeat_rule jsonb，无独立表） ----------
export function rowToRepeatRule(jsonb: unknown): RepeatRule {
  return RepeatRuleSchema.parse(jsonb)
}

// ---------- Project（review jsonb + next_review_date 单点双写） ----------
export function rowToProject(row: ProjectRow): Project {
  return ProjectSchema.parse({
    id: row.id,
    name: row.name,
    note: row.note,
    folderId: row.folderId,
    order: row.sortOrder,
    status: row.status,
    type: row.type,
    defaultDeferOffset: row.defaultDeferOffset,
    defaultDueOffset: row.defaultDueOffset,
    defaultTagIds: row.defaultTagIds ?? [],
    flagged: row.flagged,
    review: row.review as ReviewConfig,
    createdAt: row.createdAt.toISOString(),
    updatedAt: (row.updatedAt ?? row.createdAt).toISOString(),
  })
}

export function projectToRow(project: Project, userId: string): ProjectInsert {
  return {
    id: project.id,
    userId,
    folderId: project.folderId,
    name: project.name,
    note: project.note,
    sortOrder: project.order,
    status: project.status,
    type: project.type,
    defaultDeferOffset: project.defaultDeferOffset,
    defaultDueOffset: project.defaultDueOffset,
    defaultTagIds: project.defaultTagIds,
    flagged: project.flagged,
    review: project.review,
    nextReviewDate: toDate(project.review.nextReviewDate),
    createdAt: new Date(project.createdAt),
    updatedAt: new Date(project.updatedAt),
  }
}

// ---------- Task（repeatRuleId ↔ repeat_rule jsonb；tagIds/attachmentIds 装配） ----------
export function rowToTask(row: TaskRow, tagIds: string[], attachmentIds: string[]): Task {
  const repeatRule = row.repeatRule as RepeatRule | null
  return TaskSchema.parse({
    id: row.id,
    name: row.name,
    note: row.note,
    projectId: row.projectId,
    parentId: row.parentId,
    order: row.sortOrder,
    status: row.status,
    groupType: row.groupType,
    deferDate: toISO(row.deferDate),
    dueDate: toISO(row.dueDate),
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
    parentId: task.parentId,
    name: task.name,
    note: task.note,
    sortOrder: task.order,
    status: task.status,
    groupType: task.groupType,
    deferDate: toDate(task.deferDate),
    dueDate: toDate(task.dueDate),
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

export function attachmentToRow(a: Attachment): AttachmentInsert {
  return {
    id: a.id,
    taskId: a.taskId,
    kind: a.kind,
    url: a.url,
    filename: a.filename,
    createdAt: new Date(a.createdAt),
  }
}
