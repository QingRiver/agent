/**
 * 本地意图的执行器：在设备当前看见的行上原地执行命令（状态机）或字段补丁。
 * 只在本机用，产出的行变化由 emit.ts 整理成事务写入；服务器不执行这些函数。
 */
import type { ApplyResult } from '../command/state-machine'
import type {
  DeleteMutation,
  EntityRow,
  EntityRowOf,
  GtdCommand,
  GtdMutation,
  SyncEntity,
  UpsertMutation,
} from '../data/sync-schema'
import { match } from 'ts-pattern'
import { taskNotFound } from '../command/errors'
import { completeTask, createTask, deleteTask, dropTask, moveTask, reopenTask, restoreFromTrash, restoreTask } from '../command/state-machine'
import { EXPLICIT_STATUS } from '../data/types'
import { normalizeDeferDue } from '../time/normalize'

function findLive<E extends SyncEntity>(rows: EntityRow[], entity: E, id: string): EntityRowOf<E> | undefined {
  return rows.find(r => r.entity === entity && r.id === id && !r.deleted) as EntityRowOf<E> | undefined
}

export function applyCommand(
  cmd: GtdCommand,
  rows: EntityRow[],
  userId: string,
  nextSyncId: () => number,
): ApplyResult {
  return match(cmd)
    .with({ type: 'complete' }, c => completeTask(c, rows, nextSyncId))
    .with({ type: 'drop' }, c => dropTask(c, rows, nextSyncId))
    .with({ type: 'reopen' }, c => reopenTask(c, rows, nextSyncId))
    .with({ type: 'restore' }, c => restoreTask(c, rows, nextSyncId))
    .with({ type: 'delete' }, c => deleteTask(c, rows, nextSyncId))
    .with({ type: 'restore_from_trash' }, c => restoreFromTrash(c, rows, nextSyncId))
    .with({ type: 'create_task' }, c => createTask(c, rows, userId, nextSyncId))
    .with({ type: 'move_task' }, c => moveTask(c, rows, nextSyncId))
    .exhaustive()
}

export function applyMutation(
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

/** 软删非 task 行；找不到抛错，已软删为 noop。task 不能软删（回收站走 delete 命令，永久删除走 purge）。 */
function applyMutationDelete(mut: DeleteMutation, rows: EntityRow[], nextSyncId: () => number): ApplyResult {
  if (mut.entity === 'task')
    throw new Error('task 不能软删；进回收站用 delete 命令，永久删除用 purge')
  const row = rows.find(r => r.entity === mut.entity && r.id === mut.entityId)
  if (!row)
    throw new Error('要删除的数据不存在，可能已在其他设备上删除')
  if (row.deleted)
    return 'noop'
  row.deleted = true
  row.syncId = nextSyncId()
  return 'applied'
}

/** 列合并；命中软删的非 task 行则取消软删。task 只能改已有行（新建走 create_task 命令）。 */
function applyMutationUpsert(
  mut: UpsertMutation,
  rows: EntityRow[],
  userId: string,
  nextSyncId: () => number,
): ApplyResult {
  if (mut.entity === 'task_tag' && !findLive(rows, 'task', mut.patch.taskId))
    throw taskNotFound()

  const patch = mut.patch ?? {}
  const row = rows.find(r => r.entity === mut.entity && r.id === mut.entityId)
  if (row) {
    if (row.entity === 'task') {
      // 回收站里的任务不接受字段修改；移出回收站走 restore_from_trash
      if (row.data.status === EXPLICIT_STATUS.DELETED)
        return 'noop'
      const before = { deferDate: row.data.deferDate ?? null, dueDate: row.data.dueDate ?? null }
      row.data = { ...row.data, ...patch } as typeof row.data
      if (Object.hasOwn(patch, 'deferDate') || Object.hasOwn(patch, 'dueDate')) {
        const norm = normalizeDeferDue(before, patch as { deferDate?: string | null, dueDate?: string | null })
        row.data.deferDate = norm.deferDate
        row.data.dueDate = norm.dueDate
      }
    }
    else {
      row.data = { ...row.data, ...patch } as typeof row.data
      row.deleted = false
    }
    row.syncId = nextSyncId()
    return 'applied'
  }

  if (mut.entity === 'task')
    throw new Error('任务不存在（新建任务用 create_task 命令）')
  rows.push({
    entity: mut.entity,
    id: mut.entityId,
    userId,
    syncId: nextSyncId(),
    deleted: false,
    data: { ...patch },
  } as EntityRow)
  return 'applied'
}
