import type { ApplyResult } from '../command/state-machine'
import type {
  DeleteMutation,
  EntityRow,
  EntityRowOf,
  GtdCommand,
  GtdMutation,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncEntity,
  UpsertMutation,
} from '../data/sync-schema'
/**
 * GTD 多端同步核心：服务端权威 + 属性级 patch 列合并（后写赢 LWW）。
 *
 * 行模型 EntityRow 贯通 Client / wire / Postgres（同形）。
 * 类型全部从 `./sync-schema` 的 Zod 派生（单一事实源）；EntityRow.data 按 entity 收窄
 * （EntityDataOf<E>），联合类型 + ts-pattern 模式匹配收窄，消 Record<string,unknown> 与 as cast。
 * 违规 throw Error，由 radash tryit 捕获入 rejected（不分配 syncId、不阻塞后续）。
 * HTTP handler 在 apps/server 薄包装；持久化由 sync-repository 落 Postgres。
 */
import { tryit } from 'radash'
import { match } from 'ts-pattern'
import { completeTask, deleteTask, dropTask, reopenTask, restoreFromTrash, restoreTask } from '../command/state-machine'
import { EXPLICIT_STATUS } from '../data/types'
import { normalizeDeferDue } from '../time/normalize'
import { remotePurgedReason } from './reject-codes'

// re-export wire 契约（sync.ts 是 sync 模块入口）
export type {
  CompleteCommand,
  DeleteMutation,
  DropCommand,
  EntityDataOf,
  EntityRow,
  EntityRowOf,
  GtdCommand,
  GtdMutation,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncEntity,
  UpsertMutation,
} from '../data/sync-schema'

/** 服务端某用户的同步状态（applyPush 的输入真相；内部，非 wire）。 */
export interface SyncState {
  userId: string
  /** 该用户已分配的最大 syncId；下一个分配值 = clock + 1。 */
  clock: number
  rows: EntityRow[]
  /** 已处理的 mutation/command.id（幂等去重）。 */
  processedIds: Set<string>
}

interface ApplyPushResult {
  response: PushResponse
  /** apply 后的新状态（含新 clock、新行、processedIds 更新）。 */
  state: SyncState
}

/** 按 entity 收窄查找未软删行；未找到返回 undefined。 */
function findLive<E extends SyncEntity>(
  rows: EntityRow[],
  entity: E,
  id: string,
): EntityRowOf<E> | undefined {
  return rows.find(r => r.entity === entity && r.id === id && !r.deleted) as EntityRowOf<E> | undefined
}

/**
 * 拉取增量：返回 state 中 syncId > lastSyncId 的所有行（含软删行）。纯函数，不改 state。
 */
export function pull(state: SyncState, lastSyncId: number): PullResponse {
  const changes = state.rows.filter(r => r.syncId > lastSyncId)
  return { changes, serverSyncId: state.clock }
}

/**
 * 应用一次 push：先处理 commands（高风险权威命令），再处理 mutations（patch 列合并）。
 * 每条独立 tryit 捕获：违规入 rejected，不分配 syncId、不阻塞后续；applied/noop/幂等重放都 ack。
 */
export function applyPush(state: SyncState, req: PushRequest): ApplyPushResult {
  const userId = state.userId
  let clock = state.clock
  // 深拷贝行：row 新对象 + data 浅拷贝（patch 只改顶层列，不嵌套 mutate）
  const rows: EntityRow[] = state.rows.map(r => ({ ...r, data: { ...r.data } }) as EntityRow)
  const processedIds = new Set(state.processedIds)
  const applied: string[] = []
  const rejected: PushResponse['rejected'] = []

  const nextSyncId = (): number => {
    clock += 1
    return clock
  }

  // 1. commands（高风险权威命令，先于 mutations）
  const tryCmd = tryit((cmd: GtdCommand) => applyCommand(cmd, rows, nextSyncId))
  for (const cmd of req.commands) {
    if (processedIds.has(cmd.id)) {
      applied.push(cmd.id) // 幂等重放：已处理过，确认 ack 让客户端清 outbox
      continue
    }
    const [err] = tryCmd(cmd)
    if (err) {
      rejected.push({ id: cmd.id, reason: err.message })
    }
    else {
      processedIds.add(cmd.id) // applied/noop 均视为已处理
      applied.push(cmd.id)
    }
  }

  // 2. mutations（patch 列合并）
  const tryMut = tryit((mut: GtdMutation) => applyMutation(mut, rows, userId, nextSyncId))
  for (const mut of req.mutations) {
    if (processedIds.has(mut.id)) {
      applied.push(mut.id)
      continue
    }
    const [err] = tryMut(mut)
    if (err) {
      rejected.push({ id: mut.id, reason: err.message })
    }
    else {
      processedIds.add(mut.id)
      applied.push(mut.id)
    }
  }

  const changes = rows.filter(r => r.syncId > req.lastSyncId)
  return {
    response: { applied, rejected, changes, serverSyncId: clock },
    state: { userId, clock, rows, processedIds },
  }
}

// ---------------- commands ----------------

function applyCommand(
  cmd: GtdCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  // purge 后 envelope.deleted + status=DELETED：命令不可作用旧 id（提示 REMOTE_PURGED）
  const purged = findPurgedTask(rows, cmd.taskId)
  if (purged) {
    throw new Error(remotePurgedReason(purged.data.name))
  }
  return match(cmd)
    .with({ type: 'complete' }, c => completeTask(c, rows, nextSyncId))
    .with({ type: 'drop' }, c => dropTask(c, rows, nextSyncId))
    .with({ type: 'reopen' }, c => reopenTask(c, rows, nextSyncId))
    .with({ type: 'restore' }, c => restoreTask(c, rows, nextSyncId))
    .with({ type: 'delete' }, c => deleteTask(c, rows, nextSyncId))
    .with({ type: 'restore_from_trash' }, c => restoreFromTrash(c, rows, nextSyncId))
    .exhaustive()
}

/** 已 purge：envelope.deleted 且领域 status=DELETED（回收站 tombstone 的不可复活形态） */
function findPurgedTask(
  rows: EntityRow[],
  taskId: string,
): EntityRowOf<'task'> | undefined {
  const row = rows.find((r): r is EntityRowOf<'task'> =>
    r.entity === 'task' && r.id === taskId)
  if (row?.deleted && row.data.status === EXPLICIT_STATUS.DELETED)
    return row
  return undefined
}

// ---------------- mutations ----------------

function applyMutation(
  mut: GtdMutation,
  rows: EntityRow[],
  userId: string,
  nextSyncId: () => number,
): ApplyResult {
  return match(mut)
    .with({ op: 'delete' }, m => applyMutationDelete(m, rows, nextSyncId))
    .with({ op: 'upsert' }, m => applyMutationUpsert(m, rows, userId, nextSyncId))
    .exhaustive()
}

/** delete op：软删行（找不到 → throw，已软删 → noop）。 */
function applyMutationDelete(
  mut: DeleteMutation,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const row = rows.find(r => r.entity === mut.entity && r.id === mut.entityId)
  if (!row) {
    throw new Error(`${mut.entity} ${mut.entityId} not found`)
  }
  if (row.deleted) {
    return 'noop'
  }
  row.deleted = true
  row.syncId = nextSyncId()
  return 'applied'
}

/** upsert op：先引用校验，再 patch 列合并；命中软删行则复活。 */
function applyMutationUpsert(
  mut: UpsertMutation,
  rows: EntityRow[],
  userId: string,
  nextSyncId: () => number,
): ApplyResult {
  assertMutationPatch(mut, rows)

  const patch = mut.patch ?? {}
  const row = rows.find(r => r.entity === mut.entity && r.id === mut.entityId)
  if (row) {
    return match(mut)
      .with({ entity: 'task' }, () => {
        const taskRow = row as EntityRowOf<'task'>
        // 已 purge（envelope.deleted + status=DELETED）：拒绝 LWW 写活，抛 REMOTE_PURGED
        if (taskRow.deleted && taskRow.data.status === EXPLICIT_STATUS.DELETED) {
          throw new Error(remotePurgedReason(taskRow.data.name))
        }
        // 回收站 live 行（status=DELETED, envelope 未删）：终态锁 noop；复活只走 restore_from_trash
        if (taskRow.data.status === EXPLICIT_STATUS.DELETED)
          return 'noop' as const
        const before = {
          deferDate: taskRow.data.deferDate ?? null,
          dueDate: taskRow.data.dueDate ?? null,
        }
        taskRow.data = { ...taskRow.data, ...patch } as typeof taskRow.data
        if (Object.hasOwn(patch, 'deferDate') || Object.hasOwn(patch, 'dueDate')) {
          const norm = normalizeDeferDue(
            before,
            patch as { deferDate?: string | null, dueDate?: string | null },
          )
          taskRow.data.deferDate = norm.deferDate
          taskRow.data.dueDate = norm.dueDate
        }
        // envelope 软删（status≠DELETED）可被 upsert 复活
        taskRow.deleted = false
        taskRow.syncId = nextSyncId()
        return 'applied' as const
      })
      .otherwise(() => {
        row.data = { ...row.data, ...patch } as typeof row.data
        row.deleted = false // upsert 复活软删实体（创建意图按到达序胜过删除）
        row.syncId = nextSyncId()
        return 'applied' as const
      })
  }

  return match(mut)
    .with({ entity: 'task' }, (m) => {
      const norm = normalizeDeferDue(
        { deferDate: null, dueDate: null },
        patch as { deferDate?: string | null, dueDate?: string | null },
      )
      rows.push({
        entity: 'task',
        id: m.entityId,
        userId,
        syncId: nextSyncId(),
        deleted: false,
        data: { ...patch, ...norm } as EntityRowOf<'task'>['data'],
      })
      return 'applied' as const
    })
    .otherwise((m) => {
      rows.push({
        entity: m.entity,
        id: m.entityId,
        userId,
        syncId: nextSyncId(),
        deleted: false,
        data: { ...patch } as EntityRow['data'],
      } as EntityRow)
      return 'applied' as const
    })
}

/**
 * 普通字段 upsert 的引用完整性校验（parentId/taskId 存在且未软删）；违规 throw。
 * mountDirId 不在纯函数层校验——指向 dirs 表（@agent/gtd 不依赖 @agent/project），
 * 引用存活由 server 落库层 stamp 校验修正（死引用→置 null→Inbox）。
 * tagId 不在纯函数层校验——标签目录在外部 catalog（REST /tags）。
 * ts-pattern 按 entity 模式匹配收窄 patch 类型，字段直接 string，无需 cast。
 */
function assertMutationPatch(mut: UpsertMutation, rows: EntityRow[]): void {
  void match(mut)
    .with({ entity: 'task' }, (m) => {
      const patch = m.patch ?? {}
      const { parentId } = patch
      if (parentId != null && !findLive(rows, 'task', parentId)) {
        throw new Error(`parent task ${parentId} not found`)
      }
    })
    .with({ entity: 'task_tag' }, (m) => {
      const { taskId } = m.patch
      if (!findLive(rows, 'task', taskId)) {
        throw new Error(`task ${taskId} not found`)
      }
    })
    .otherwise(() => {
      // 其他 entity upsert：暂不校验引用
    })
}
