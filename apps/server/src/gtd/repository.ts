import type {
  Attachment,
  Folder,
  GtdDocument,
  GtdRepository,
  Perspective,
  Project,
  RepeatRule,
  Tag,
  Task,
} from '@agent/gtd'
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from '../db/drizzle'
import {
  gtdAttachments,
  gtdFolders,
  gtdPerspectives,
  gtdProjects,
  gtdTags,
  gtdTasks,
  gtdTaskTags,
} from '../db/schema'
import {
  attachmentToRow,
  folderToRow,
  perspectiveToRow,
  projectToRow,
  rowToAttachment,
  rowToFolder,
  rowToPerspective,
  rowToProject,
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
  folders: Folder[],
  tags: Tag[],
  projects: Project[],
  tasks: Task[],
  attachments: Attachment[],
  perspectives: Perspective[] = [],
): string[] {
  const stamps: string[] = []
  for (const f of folders) {
    stamps.push(f.createdAt)
    if (f.updatedAt)
      stamps.push(f.updatedAt)
  }
  for (const t of tags) {
    stamps.push(t.createdAt)
    if (t.updatedAt)
      stamps.push(t.updatedAt)
  }
  for (const p of projects) {
    stamps.push(p.createdAt, p.updatedAt)
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
    const [folders, tags, projects, perspectives, tasks] = await Promise.all([
      db.select().from(gtdFolders).where(eq(gtdFolders.userId, userId)),
      db.select().from(gtdTags).where(eq(gtdTags.userId, userId)),
      db.select().from(gtdProjects).where(eq(gtdProjects.userId, userId)),
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

    const folderEntities = folders.map(rowToFolder)
    const tagEntities = tags.map(rowToTag)
    const projectEntities = projects.map(rowToProject)
    const perspectiveEntities = perspectives.map(rowToPerspective)
    const meta = aggregateDocMeta(collectDocTimestamps(
      folderEntities,
      tagEntities,
      projectEntities,
      taskEntities,
      attachmentEntities,
      perspectiveEntities,
    ))

    return {
      version: '1',
      meta: { ...meta, schemaVersion: SCHEMA_VERSION },
      folders: folderEntities,
      projects: projectEntities,
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
      await tx.delete(gtdProjects).where(eq(gtdProjects.userId, userId))
      await tx.delete(gtdTags).where(eq(gtdTags.userId, userId))
      await tx.delete(gtdFolders).where(eq(gtdFolders.userId, userId))
      // upsert 全部（DEFERRABLE 允许任意顺序）
      if (doc.folders.length)
        await tx.insert(gtdFolders).values(doc.folders.map(f => folderToRow(f, userId)))
      if (doc.tags.length)
        await tx.insert(gtdTags).values(doc.tags.map(t => tagToRow(t, userId)))
      if (doc.projects.length)
        await tx.insert(gtdProjects).values(doc.projects.map(p => projectToRow(p, userId)))
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
            parentId: row.parentId,
            name: row.name,
            note: row.note,
            sortOrder: row.sortOrder,
            status: row.status,
            groupType: row.groupType,
            deferDate: row.deferDate,
            dueDate: row.dueDate,
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

  async getProject(userId: string, projectId: string): Promise<Project | null> {
    const [project] = await db
      .select()
      .from(gtdProjects)
      .where(and(eq(gtdProjects.userId, userId), eq(gtdProjects.id, projectId)))
      .limit(1)
    return project ? rowToProject(project) : null
  }

  async saveProject(userId: string, project: Project): Promise<void> {
    const row = projectToRow(project, userId)
    await db
      .insert(gtdProjects)
      .values(row)
      .onConflictDoUpdate({
        target: gtdProjects.id,
        set: {
          folderId: row.folderId,
          name: row.name,
          note: row.note,
          sortOrder: row.sortOrder,
          status: row.status,
          type: row.type,
          defaultDeferOffset: row.defaultDeferOffset,
          defaultDueOffset: row.defaultDueOffset,
          defaultTagIds: row.defaultTagIds,
          flagged: row.flagged,
          review: row.review,
          nextReviewDate: row.nextReviewDate,
          updatedAt: row.updatedAt,
        },
      })
  }

  async deleteProject(userId: string, projectId: string): Promise<void> {
    await db
      .delete(gtdProjects)
      .where(and(eq(gtdProjects.userId, userId), eq(gtdProjects.id, projectId)))
  }

  async saveFolder(userId: string, folder: Folder): Promise<void> {
    const row = folderToRow(folder, userId)
    await db
      .insert(gtdFolders)
      .values(row)
      .onConflictDoUpdate({
        target: gtdFolders.id,
        set: {
          parentId: row.parentId,
          name: row.name,
          sortOrder: row.sortOrder,
          status: row.status,
          updatedAt: row.updatedAt,
        },
      })
  }

  async deleteFolder(userId: string, folderId: string): Promise<void> {
    await db
      .delete(gtdFolders)
      .where(and(eq(gtdFolders.userId, userId), eq(gtdFolders.id, folderId)))
  }

  async saveTag(userId: string, tag: Tag): Promise<void> {
    const row = tagToRow(tag, userId)
    await db
      .insert(gtdTags)
      .values(row)
      .onConflictDoUpdate({
        target: gtdTags.id,
        set: {
          parentId: row.parentId,
          name: row.name,
          color: row.color,
          sortOrder: row.sortOrder,
          updatedAt: row.updatedAt,
        },
      })
  }

  async deleteTag(userId: string, tagId: string): Promise<void> {
    await db
      .delete(gtdTags)
      .where(and(eq(gtdTags.userId, userId), eq(gtdTags.id, tagId)))
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
