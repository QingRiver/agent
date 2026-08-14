import type { EntityRow, EntityRowOf, PullResponse, PushRequest, PushResponse, RepeatRule, SyncState } from '@agent/gtd'
import type { DirRow } from '@agent/project'
import type {
  AttachmentRow,
  PerspectiveRow,
  TaskRow,
} from '../db/schema'
import { applyPush } from '@agent/gtd'
/**
 * GTD sync Postgres 落库。
 *
 * EntityRow 是 Client/wire/PG 同构真相。push 单事务：FOR UPDATE clock → 装配 SyncState
 * → applyPush 纯函数 → **死 mountDirId 修正** → 写变更行（upsert）
 * + clock + 幂等 → 返回 response。
 *
 * pull 纯读 sync_id > lastSyncId。日常路径为行级增量，无全量文档写。
 * 标签目录已退出 sync（REST /tags）；task_tag 仍走 sync，落库前校验 tag 在 DB 存活。
 */
import { and, eq, gt, inArray } from 'drizzle-orm'
import { db } from '../db/drizzle'
import {
  dirs,
  gtdAttachments,
  gtdPerspectives,
  gtdSyncClocks,
  gtdSyncMutations,
  gtdTasks,
  gtdTaskTags,
  tags,
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
      repeatRule,
      repeatedFromTaskId: row.repeatedFromTaskId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: (row.updatedAt ?? row.createdAt).toISOString(),
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
          mountDirId: d.mountDirId ?? null,
          parentId: d.parentId,
          sortOrder: d.order,
          status: d.status,
          groupType: d.groupType,
          deferDate: toDate(d.deferDate),
          dueDate: toDate(d.dueDate),
          plannedMode: d.plannedMode ?? 'none',
          plannedDate: toDate(d.plannedDate),
          completedAt: toDate(d.completedAt),
          heldAt: toDate(d.heldAt),
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
            mountDirId: d.mountDirId ?? null,
            parentId: d.parentId,
            sortOrder: d.order,
            status: d.status,
            groupType: d.groupType,
            deferDate: toDate(d.deferDate),
            dueDate: toDate(d.dueDate),
            plannedMode: d.plannedMode ?? 'none',
            plannedDate: toDate(d.plannedDate),
            completedAt: toDate(d.completedAt),
            heldAt: toDate(d.heldAt),
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

// ---------------- pull ----------------

/** 拉取增量：各表 sync_id > lastSyncId（含软删）→ EntityRow[]。标签目录已退出 sync，不下发 tag 行。 */
export async function pullFromPg(userId: string, lastSyncId: number): Promise<PullResponse> {
  const [perspectives, tasks, taskTags, attachments, clockRow] = await Promise.all([
    db.select().from(gtdPerspectives).where(and(eq(gtdPerspectives.userId, userId), gt(gtdPerspectives.syncId, lastSyncId))),
    db.select().from(gtdTasks).where(and(eq(gtdTasks.userId, userId), gt(gtdTasks.syncId, lastSyncId))),
    db.select().from(gtdTaskTags).where(and(eq(gtdTaskTags.userId, userId), gt(gtdTaskTags.syncId, lastSyncId))),
    db.select().from(gtdAttachments).where(and(eq(gtdAttachments.userId, userId), gt(gtdAttachments.syncId, lastSyncId))),
    db.select().from(gtdSyncClocks).where(eq(gtdSyncClocks.userId, userId)),
  ])

  const changes: EntityRow[] = [
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

    // 1.5 task_tag upsert：校验 tag 在 DB 存活（目录走 REST，不在 sync 行集）
    const earlyRejected: { id: string, reason: string }[] = []
    const mutations: typeof req.mutations = []
    for (const m of req.mutations) {
      if (m.entity === 'task_tag' && m.op === 'upsert') {
        const tagId = m.patch.tagId
        const live = await tx.select({ id: tags.id }).from(tags).where(and(
          eq(tags.id, tagId),
          eq(tags.userId, userId),
          eq(tags.deleted, false),
        )).limit(1)
        if (!live[0]) {
          earlyRejected.push({ id: m.id, reason: `tag ${tagId} not found` })
          continue
        }
      }
      mutations.push(m)
    }
    const filteredReq: PushRequest = { ...req, mutations }

    // 2. 装配 SyncState（含 req 的幂等 ids）
    const reqIds = [...req.mutations.map(m => m.id), ...req.commands.map(c => c.id)]
    const state = await loadSyncStateInTx(tx, userId, reqIds)

    // 3. applyPush 纯函数（内部 tryit 已捕获违规入 rejected，不抛）
    const result = applyPush(state, filteredReq)
    const response = result.response
    response.rejected = [...earlyRejected, ...response.rejected]
    const newClock = result.state.clock
    // 变更行 = newState 中 syncId > oldClock（本次分配的）
    const changedRows = result.state.rows.filter(r => r.syncId > oldClock)

    // 3.5. 死 mountDirId 修正（顶层 task 降级 Inbox）。
    //   mountDirId 指向已删/不存在 dir 时：parentId=null → 清 mountDirId；
    //   child 受 CHECK ck_gtd_tasks_inbox 须保留 mountDirId。
    const changedTasks = changedRows.filter(
      (r): r is EntityRowOf<'task'> => r.entity === 'task',
    )
    if (changedTasks.length > 0) {
      const dirRows = await tx.select().from(dirs).where(and(eq(dirs.userId, userId), eq(dirs.deleted, false)))
      const dirsById = new Map<string, Pick<DirRow, 'id' | 'parentId' | 'kind'>>()
      for (const d of dirRows) {
        dirsById.set(d.id, { id: d.id, parentId: d.parentId, kind: d.kind as DirRow['kind'] })
      }
      for (const row of changedTasks) {
        const mount = row.data.mountDirId ?? null
        if (mount == null)
          continue
        if (!dirsById.has(mount) && row.data.parentId == null) {
          row.data.mountDirId = null
        }
      }
    }

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

    // 7. response.changes = newState 中 syncId > req.lastSyncId
    response.changes = result.state.rows.filter(r => r.syncId > req.lastSyncId)

    response.serverSyncId = newClock
    return response
  })
}

/**
 * 事务内装配 SyncState（loadSyncState 的 tx 版本，读同一事务快照）。
 *  事务绑定单一 pg 连接，禁止 Promise.all 并发 select（触发 pg 并发查询警告且可能错位结果），逐条 await。
 * 标签目录已退出 sync：不装入 tag 行（task_tag 引用由落库前 DB 校验）。
 */
async function loadSyncStateInTx(tx: Tx, userId: string, reqIds: string[]): Promise<SyncState> {
  const perspectives = await tx.select().from(gtdPerspectives).where(eq(gtdPerspectives.userId, userId))
  const tasks = await tx.select().from(gtdTasks).where(eq(gtdTasks.userId, userId))
  const taskTags = await tx.select().from(gtdTaskTags).where(eq(gtdTaskTags.userId, userId))
  const attachments = await tx.select().from(gtdAttachments).where(eq(gtdAttachments.userId, userId))
  const clockRow = await tx.select().from(gtdSyncClocks).where(eq(gtdSyncClocks.userId, userId))

  const rows: EntityRow[] = [
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

/**
 * 在线 purge 回收站任务：status=deleted 且未 envelope 删 → 标 deleted=true（不可复活 tombstone）。
 * 级联软删 task_tag / attachment；推进 clock。旁路 sync outbox。
 */
export async function purgeTrashFromPg(
  userId: string,
  taskIds: string[],
): Promise<{
  purged: { id: string, name: string }[]
  skipped: { id: string, reason: string }[]
  changes: EntityRow[]
  serverSyncId: number
}> {
  return db.transaction(async (tx) => {
    await tx.insert(gtdSyncClocks).values({ userId, clock: 0 }).onConflictDoNothing()
    const clockRow = await tx.select().from(gtdSyncClocks).where(eq(gtdSyncClocks.userId, userId)).for('update')
    let clock = clockRow[0]?.clock ?? 0

    const taskRows = await tx.select().from(gtdTasks).where(and(
      eq(gtdTasks.userId, userId),
      inArray(gtdTasks.id, taskIds),
    ))
    const byId = new Map(taskRows.map(r => [r.id, r]))

    const purged: { id: string, name: string }[] = []
    const skipped: { id: string, reason: string }[] = []
    const changes: EntityRow[] = []

    for (const id of taskIds) {
      const row = byId.get(id)
      if (!row) {
        skipped.push({ id, reason: 'not_found' })
        continue
      }
      if (row.deleted) {
        skipped.push({ id, reason: 'already_purged' })
        continue
      }
      if (row.status !== 'deleted') {
        skipped.push({ id, reason: 'not_in_trash' })
        continue
      }

      clock += 1
      const [updated] = await tx.update(gtdTasks)
        .set({ deleted: true, syncId: clock, updatedAt: new Date() })
        .where(and(eq(gtdTasks.id, id), eq(gtdTasks.userId, userId)))
        .returning()
      if (!updated) {
        skipped.push({ id, reason: 'update_failed' })
        continue
      }
      purged.push({ id, name: updated.name })
      changes.push(rowToTaskEntity(updated))

      const tags = await tx.select().from(gtdTaskTags).where(and(
        eq(gtdTaskTags.userId, userId),
        eq(gtdTaskTags.taskId, id),
        eq(gtdTaskTags.deleted, false),
      ))
      for (const t of tags) {
        clock += 1
        const [tt] = await tx.update(gtdTaskTags)
          .set({ deleted: true, syncId: clock })
          .where(and(eq(gtdTaskTags.taskId, t.taskId), eq(gtdTaskTags.tagId, t.tagId)))
          .returning()
        if (tt)
          changes.push(rowToTaskTagEntity(tt))
      }

      const atts = await tx.select().from(gtdAttachments).where(and(
        eq(gtdAttachments.userId, userId),
        eq(gtdAttachments.taskId, id),
        eq(gtdAttachments.deleted, false),
      ))
      for (const a of atts) {
        clock += 1
        const [att] = await tx.update(gtdAttachments)
          .set({ deleted: true, syncId: clock })
          .where(eq(gtdAttachments.id, a.id))
          .returning()
        if (att)
          changes.push(rowToAttachmentEntity(att))
      }
    }

    const oldClock = clockRow[0]?.clock ?? 0
    if (clock !== oldClock) {
      await tx.update(gtdSyncClocks)
        .set({ clock, updatedAt: new Date() })
        .where(eq(gtdSyncClocks.userId, userId))
    }

    return { purged, skipped, changes, serverSyncId: clock }
  })
}
