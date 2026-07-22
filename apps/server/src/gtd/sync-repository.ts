import type { EntityRow, PullResponse, PushRequest, PushResponse, RepeatRule, SyncState } from '@agent/gtd'
import type {
  AttachmentRow,
  FolderRow,
  PerspectiveRow,
  ProjectRow,
  TagRow,
  TaskRow,
} from '../db/schema'
import { applyPush } from '@agent/gtd'
/**
 * GTD sync Postgres 落库。
 *
 * EntityRow 是 Client/wire/PG 同构真相。push 单事务：FOR UPDATE clock → 装配 SyncState
 * → applyPush 纯函数 → 写变更行（upsert）+ clock + 幂等 → 返回 response。
 * pull 纯读 sync_id > lastSyncId。日常路径禁止 saveDocument 全删全插。
 */
import { and, eq, gt, inArray } from 'drizzle-orm'
import { db } from '../db/drizzle'
import {
  gtdAttachments,
  gtdFolders,
  gtdPerspectives,
  gtdProjects,
  gtdSyncClocks,
  gtdSyncMutations,
  gtdTags,
  gtdTasks,
  gtdTaskTags,
} from '../db/schema'

/** ISO 字符串 → Date（drizzle timestamptz mode:'date' 期望 Date 对象） */
/** ISO 字符串 → Date（重载：string→Date, null/undefined→null） */
function toDate(iso: string): Date
function toDate(iso: string | null | undefined): Date | null
function toDate(iso: string | null | undefined): Date | null {
  return iso ? new Date(iso) : null
}

/** Date → ISO 字符串（drizzle select 返回 Date|null） */
const toISO = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null)

/** drizzle 事务 tx 类型（PgTransaction，非 NodePgDatabase） */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// ---------------- DB row → EntityRow ----------------

function rowToTaskEntity(row: TaskRow): EntityRow {
  const repeatRule = row.repeatRule as RepeatRule | null
  return {
    entity: 'task',
    id: row.id,
    userId: row.userId,
    syncId: row.syncId ?? 0,
    deleted: row.deleted,
    data: {
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
      repeatRule,
      repeatedFromTaskId: row.repeatedFromTaskId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: (row.updatedAt ?? row.createdAt).toISOString(),
    },
  } as unknown as EntityRow
}

function rowToProjectEntity(row: ProjectRow): EntityRow {
  return {
    entity: 'project',
    id: row.id,
    userId: row.userId,
    syncId: row.syncId ?? 0,
    deleted: row.deleted,
    data: {
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
      review: row.review,
      createdAt: row.createdAt.toISOString(),
      updatedAt: (row.updatedAt ?? row.createdAt).toISOString(),
    },
  } as unknown as EntityRow
}

function rowToFolderEntity(row: FolderRow): EntityRow {
  return {
    entity: 'folder',
    id: row.id,
    userId: row.userId,
    syncId: row.syncId ?? 0,
    deleted: row.deleted,
    data: {
      name: row.name,
      parentId: row.parentId,
      order: row.sortOrder,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: toISO(row.updatedAt),
    },
  } as unknown as EntityRow
}

function rowToTagEntity(row: TagRow): EntityRow {
  return {
    entity: 'tag',
    id: row.id,
    userId: row.userId,
    syncId: row.syncId ?? 0,
    deleted: row.deleted,
    data: {
      name: row.name,
      parentId: row.parentId,
      order: row.sortOrder,
      color: row.color,
      createdAt: row.createdAt.toISOString(),
      updatedAt: toISO(row.updatedAt),
    },
  } as unknown as EntityRow
}

function rowToPerspectiveEntity(row: PerspectiveRow): EntityRow {
  return {
    entity: 'perspective',
    id: row.id,
    userId: row.userId,
    syncId: row.syncId ?? 0,
    deleted: row.deleted,
    data: {
      name: row.name,
      icon: row.icon,
      filter: row.filter,
      groupBy: row.groupBy ?? [],
      sortBy: row.sortBy ?? [],
      availabilityFilter: row.availabilityFilter,
      showCompleted: row.showCompleted,
      showDropped: row.showDropped,
      flaggedOnly: row.flaggedOnly,
      createdAt: row.createdAt.toISOString(),
      updatedAt: toISO(row.updatedAt),
    },
  } as unknown as EntityRow
}

function rowToAttachmentEntity(row: AttachmentRow): EntityRow {
  return {
    entity: 'attachment',
    id: row.id,
    userId: row.userId,
    syncId: row.syncId ?? 0,
    deleted: row.deleted,
    data: {
      taskId: row.taskId,
      kind: row.kind,
      url: row.url,
      filename: row.filename,
      createdAt: row.createdAt.toISOString(),
    },
  } as unknown as EntityRow
}

function rowToTaskTagEntity(row: typeof gtdTaskTags.$inferSelect): EntityRow {
  return {
    entity: 'task_tag',
    id: `${row.taskId}|${row.tagId}`,
    userId: row.userId,
    syncId: row.syncId ?? 0,
    deleted: row.deleted,
    data: { taskId: row.taskId, tagId: row.tagId },
  } as unknown as EntityRow
}

// ---------------- EntityRow → DB upsert ----------------

/** upsert 一行到对应表（onConflictDoUpdate 整行覆盖 data 列 + syncId/deleted）。 */
async function upsertEntityRow(row: EntityRow, tx: Tx): Promise<void> {
  switch (row.entity) {
    case 'task': {
      const d = row.data
      await tx.insert(gtdTasks)
        .values({
          id: row.id,
          userId: row.userId,
          name: d.name,
          note: d.note,
          projectId: d.projectId,
          parentId: d.parentId,
          sortOrder: d.order,
          status: d.status,
          groupType: d.groupType,
          deferDate: toDate(d.deferDate),
          dueDate: toDate(d.dueDate),
          completedAt: toDate(d.completedAt),
          droppedAt: toDate(d.droppedAt),
          flagged: d.flagged,
          estimateMinutes: d.estimateMinutes,
          repeatRule: d.repeatRule,
          repeatedFromTaskId: d.repeatedFromTaskId,
          syncId: row.syncId,
          deleted: row.deleted,
          createdAt: toDate(d.createdAt),
          updatedAt: toDate(d.updatedAt),
        })
        .onConflictDoUpdate({
          target: gtdTasks.id,
          set: {
            name: d.name,
            note: d.note,
            projectId: d.projectId,
            parentId: d.parentId,
            sortOrder: d.order,
            status: d.status,
            groupType: d.groupType,
            deferDate: toDate(d.deferDate),
            dueDate: toDate(d.dueDate),
            completedAt: toDate(d.completedAt),
            droppedAt: toDate(d.droppedAt),
            flagged: d.flagged,
            estimateMinutes: d.estimateMinutes,
            repeatRule: d.repeatRule,
            repeatedFromTaskId: d.repeatedFromTaskId,
            syncId: row.syncId,
            deleted: row.deleted,
            updatedAt: toDate(d.updatedAt),
          },
        })
      break
    }
    case 'task_tag': {
      const d = row.data
      await tx.insert(gtdTaskTags)
        .values({
          taskId: d.taskId,
          tagId: d.tagId,
          userId: row.userId,
          syncId: row.syncId,
          deleted: row.deleted,
        })
        .onConflictDoUpdate({
          target: [gtdTaskTags.taskId, gtdTaskTags.tagId],
          set: { userId: row.userId, syncId: row.syncId, deleted: row.deleted },
        })
      break
    }
    case 'project': {
      const d = row.data
      await tx.insert(gtdProjects)
        .values({
          id: row.id,
          userId: row.userId,
          folderId: d.folderId,
          name: d.name,
          note: d.note,
          sortOrder: d.order,
          status: d.status,
          type: d.type,
          defaultDeferOffset: d.defaultDeferOffset,
          defaultDueOffset: d.defaultDueOffset,
          defaultTagIds: d.defaultTagIds,
          flagged: d.flagged,
          review: d.review,
          nextReviewDate: toDate(d.review.nextReviewDate),
          syncId: row.syncId,
          deleted: row.deleted,
          createdAt: toDate(d.createdAt),
          updatedAt: toDate(d.updatedAt),
        })
        .onConflictDoUpdate({
          target: gtdProjects.id,
          set: {
            folderId: d.folderId,
            name: d.name,
            note: d.note,
            sortOrder: d.order,
            status: d.status,
            type: d.type,
            defaultDeferOffset: d.defaultDeferOffset,
            defaultDueOffset: d.defaultDueOffset,
            defaultTagIds: d.defaultTagIds,
            flagged: d.flagged,
            review: d.review,
            nextReviewDate: toDate(d.review.nextReviewDate),
            syncId: row.syncId,
            deleted: row.deleted,
            updatedAt: toDate(d.updatedAt),
          },
        })
      break
    }
    case 'folder': {
      const d = row.data
      await tx.insert(gtdFolders)
        .values({
          id: row.id,
          userId: row.userId,
          parentId: d.parentId,
          name: d.name,
          sortOrder: d.order,
          status: d.status,
          syncId: row.syncId,
          deleted: row.deleted,
          createdAt: toDate(d.createdAt),
          updatedAt: toDate(d.updatedAt),
        })
        .onConflictDoUpdate({
          target: gtdFolders.id,
          set: {
            parentId: d.parentId,
            name: d.name,
            sortOrder: d.order,
            status: d.status,
            syncId: row.syncId,
            deleted: row.deleted,
            updatedAt: toDate(d.updatedAt),
          },
        })
      break
    }
    case 'tag': {
      const d = row.data
      await tx.insert(gtdTags)
        .values({
          id: row.id,
          userId: row.userId,
          parentId: d.parentId,
          name: d.name,
          color: d.color,
          sortOrder: d.order,
          syncId: row.syncId,
          deleted: row.deleted,
          createdAt: toDate(d.createdAt),
          updatedAt: toDate(d.updatedAt),
        })
        .onConflictDoUpdate({
          target: gtdTags.id,
          set: {
            parentId: d.parentId,
            name: d.name,
            color: d.color,
            sortOrder: d.order,
            syncId: row.syncId,
            deleted: row.deleted,
            updatedAt: toDate(d.updatedAt),
          },
        })
      break
    }
    case 'perspective': {
      const d = row.data
      await tx.insert(gtdPerspectives)
        .values({
          id: row.id,
          userId: row.userId,
          name: d.name,
          icon: d.icon,
          filter: d.filter,
          groupBy: d.groupBy,
          sortBy: d.sortBy,
          availabilityFilter: d.availabilityFilter,
          showCompleted: d.showCompleted,
          showDropped: d.showDropped,
          flaggedOnly: d.flaggedOnly,
          syncId: row.syncId,
          deleted: row.deleted,
          createdAt: toDate(d.createdAt),
          updatedAt: toDate(d.updatedAt),
        })
        .onConflictDoUpdate({
          target: gtdPerspectives.id,
          set: {
            name: d.name,
            icon: d.icon,
            filter: d.filter,
            groupBy: d.groupBy,
            sortBy: d.sortBy,
            availabilityFilter: d.availabilityFilter,
            showCompleted: d.showCompleted,
            showDropped: d.showDropped,
            flaggedOnly: d.flaggedOnly,
            syncId: row.syncId,
            deleted: row.deleted,
            updatedAt: toDate(d.updatedAt),
          },
        })
      break
    }
    case 'attachment': {
      const d = row.data
      await tx.insert(gtdAttachments)
        .values({
          id: row.id,
          userId: row.userId,
          taskId: d.taskId,
          kind: d.kind,
          url: d.url,
          filename: d.filename,
          syncId: row.syncId,
          deleted: row.deleted,
          createdAt: toDate(d.createdAt),
        })
        .onConflictDoUpdate({
          target: gtdAttachments.id,
          set: {
            taskId: d.taskId,
            kind: d.kind,
            url: d.url,
            filename: d.filename,
            syncId: row.syncId,
            deleted: row.deleted,
          },
        })
      break
    }
    default:
      break
  }
}

// ---------------- loadSyncState ----------------

/** 装配用户完整 SyncState（七表读 live+deleted 行 + clock + 幂等 ids）。 */
export async function loadSyncState(userId: string, reqIds?: string[]): Promise<SyncState> {
  const [folders, tags, projects, perspectives, tasks, taskTags, attachments, clockRow] = await Promise.all([
    db.select().from(gtdFolders).where(eq(gtdFolders.userId, userId)),
    db.select().from(gtdTags).where(eq(gtdTags.userId, userId)),
    db.select().from(gtdProjects).where(eq(gtdProjects.userId, userId)),
    db.select().from(gtdPerspectives).where(eq(gtdPerspectives.userId, userId)),
    db.select().from(gtdTasks).where(eq(gtdTasks.userId, userId)),
    db.select().from(gtdTaskTags).where(eq(gtdTaskTags.userId, userId)),
    db.select().from(gtdAttachments).where(eq(gtdAttachments.userId, userId)),
    db.select().from(gtdSyncClocks).where(eq(gtdSyncClocks.userId, userId)),
  ])

  const rows: EntityRow[] = [
    ...folders.map(rowToFolderEntity),
    ...tags.map(rowToTagEntity),
    ...projects.map(rowToProjectEntity),
    ...perspectives.map(rowToPerspectiveEntity),
    ...tasks.map(rowToTaskEntity),
    ...attachments.map(rowToAttachmentEntity),
    ...taskTags.map(rowToTaskTagEntity),
  ]

  // 幂等：仅加载本次 req 涉及的已处理 ids（避免全量加载用户所有 mutation）
  const processedIds = new Set<string>()
  if (reqIds && reqIds.length > 0) {
    const existing = await db.select({ mutationId: gtdSyncMutations.mutationId })
      .from(gtdSyncMutations)
      .where(and(eq(gtdSyncMutations.userId, userId), inArray(gtdSyncMutations.mutationId, reqIds)))
    for (const m of existing) {
      processedIds.add(m.mutationId)
    }
  }

  return {
    userId,
    clock: clockRow[0]?.clock ?? 0,
    rows,
    processedIds,
  }
}

// ---------------- pull ----------------

/** 拉取增量：各表 sync_id > lastSyncId（含软删）→ EntityRow[]。 */
export async function pullFromPg(userId: string, lastSyncId: number): Promise<PullResponse> {
  const [folders, tags, projects, perspectives, tasks, taskTags, attachments, clockRow] = await Promise.all([
    db.select().from(gtdFolders).where(and(eq(gtdFolders.userId, userId), gt(gtdFolders.syncId, lastSyncId))),
    db.select().from(gtdTags).where(and(eq(gtdTags.userId, userId), gt(gtdTags.syncId, lastSyncId))),
    db.select().from(gtdProjects).where(and(eq(gtdProjects.userId, userId), gt(gtdProjects.syncId, lastSyncId))),
    db.select().from(gtdPerspectives).where(and(eq(gtdPerspectives.userId, userId), gt(gtdPerspectives.syncId, lastSyncId))),
    db.select().from(gtdTasks).where(and(eq(gtdTasks.userId, userId), gt(gtdTasks.syncId, lastSyncId))),
    db.select().from(gtdTaskTags).where(and(eq(gtdTaskTags.userId, userId), gt(gtdTaskTags.syncId, lastSyncId))),
    db.select().from(gtdAttachments).where(and(eq(gtdAttachments.userId, userId), gt(gtdAttachments.syncId, lastSyncId))),
    db.select().from(gtdSyncClocks).where(eq(gtdSyncClocks.userId, userId)),
  ])

  const changes: EntityRow[] = [
    ...folders.map(rowToFolderEntity),
    ...tags.map(rowToTagEntity),
    ...projects.map(rowToProjectEntity),
    ...perspectives.map(rowToPerspectiveEntity),
    ...tasks.map(rowToTaskEntity),
    ...attachments.map(rowToAttachmentEntity),
    ...taskTags.map(rowToTaskTagEntity),
  ]

  return { changes, serverSyncId: clockRow[0]?.clock ?? 0 }
}

// ---------------- push ----------------

/**
 * 应用 push 并落库（单事务）：
 * FOR UPDATE clock → 装配 SyncState（含幂等 ids）→ applyPush → 写变更行（syncId > oldClock）
 * + clock + 幂等表 → 返回 response。
 */
export async function applyPushToPg(userId: string, req: PushRequest): Promise<PushResponse> {
  return db.transaction(async (tx) => {
    // 1. 锁 clock 行（不存在则插入 0；onConflict 防 PK 竞争）
    await tx.insert(gtdSyncClocks).values({ userId, clock: 0 }).onConflictDoNothing()
    const clockRow = await tx.select().from(gtdSyncClocks).where(eq(gtdSyncClocks.userId, userId)).for('update')
    const oldClock = clockRow[0]?.clock ?? 0

    // 2. 装配 SyncState（含 req 的幂等 ids）
    const reqIds = [...req.mutations.map(m => m.id), ...req.commands.map(c => c.id)]
    const state = await loadSyncStateInTx(tx, userId, reqIds, oldClock)

    // 3. applyPush 纯函数（内部 tryit 已捕获违规入 rejected，不抛）
    const result = applyPush(state, req)
    const response = result.response
    const newClock = result.state.clock
    // 变更行 = newState 中 syncId > oldClock（本次分配的）
    const changedRows = result.state.rows.filter(r => r.syncId > oldClock)

    // 4. 写变更行 upsert
    for (const row of changedRows) {
      await upsertEntityRow(row, tx)
    }

    // 5. 更新 clock
    if (newClock !== oldClock) {
      await tx.update(gtdSyncClocks).set({ clock: newClock, updatedAt: new Date() }).where(eq(gtdSyncClocks.userId, userId))
    }

    // 6. 插入幂等记录（applied + rejected 都记，避免死重试）
    const allIds = [...response.applied, ...response.rejected.map(r => r.id)]
    if (allIds.length > 0) {
      await tx.insert(gtdSyncMutations)
        .values(allIds.map(id => ({
          userId,
          mutationId: id,
          syncId: response.applied.includes(id) ? newClock : null,
          status: response.applied.includes(id) ? 'applied' : 'rejected',
        })))
        .onConflictDoNothing()
    }

    // 7. response.changes = newState 中 syncId > req.lastSyncId（含本次变更 + 之前未拉取的）
    response.changes = result.state.rows.filter(r => r.syncId > req.lastSyncId)

    response.serverSyncId = newClock
    return response
  }).then((r) => {
    return r
  })
}

/**
 * 事务内装配 SyncState（loadSyncState 的 tx 版本，读同一事务快照）。
 *  事务绑定单一 pg 连接，禁止 Promise.all 并发 select（触发 pg 并发查询警告且可能错位结果），逐条 await。
 */
async function loadSyncStateInTx(tx: Tx, userId: string, reqIds: string[], _oldClock: number): Promise<SyncState> {
  const folders = await tx.select().from(gtdFolders).where(eq(gtdFolders.userId, userId))
  const tags = await tx.select().from(gtdTags).where(eq(gtdTags.userId, userId))
  const projects = await tx.select().from(gtdProjects).where(eq(gtdProjects.userId, userId))
  const perspectives = await tx.select().from(gtdPerspectives).where(eq(gtdPerspectives.userId, userId))
  const tasks = await tx.select().from(gtdTasks).where(eq(gtdTasks.userId, userId))
  const taskTags = await tx.select().from(gtdTaskTags).where(eq(gtdTaskTags.userId, userId))
  const attachments = await tx.select().from(gtdAttachments).where(eq(gtdAttachments.userId, userId))
  const clockRow = await tx.select().from(gtdSyncClocks).where(eq(gtdSyncClocks.userId, userId))

  const rows: EntityRow[] = [
    ...folders.map(rowToFolderEntity),
    ...tags.map(rowToTagEntity),
    ...projects.map(rowToProjectEntity),
    ...perspectives.map(rowToPerspectiveEntity),
    ...tasks.map(rowToTaskEntity),
    ...attachments.map(rowToAttachmentEntity),
    ...taskTags.map(rowToTaskTagEntity),
  ]

  const processedIds = new Set<string>()
  if (reqIds.length > 0) {
    const existing = await tx.select({ mutationId: gtdSyncMutations.mutationId })
      .from(gtdSyncMutations)
      .where(and(eq(gtdSyncMutations.userId, userId), inArray(gtdSyncMutations.mutationId, reqIds)))
    for (const m of existing) {
      processedIds.add(m.mutationId)
    }
  }

  return {
    userId,
    clock: clockRow[0]?.clock ?? 0,
    rows,
    processedIds,
  }
}
