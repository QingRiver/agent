/**
 * 把 Op 写回 state。HTTP 请求体同样是 Op。
 */
import type { EntityRow } from './data/row-schema'
import type { ApplyRequest, GtdRowsResponse, Op } from './op'
import { EXPLICIT_STATUS } from './data/types'
import { taskLabel, taskNotFound } from './errors'
import { ApplyRequestSchema, GtdRowsResponseSchema, OpSchema } from './op'
import { runCreate } from './state/create'
import { GtdModel } from './state/model'
import { subtree } from './state/tree'
import { runMove, runPatch } from './state/update'
import { transition } from './transition'

export { ApplyRequestSchema, GtdRowsResponseSchema, OpSchema }
export type { ApplyRequest, GtdRowsResponse, Op }

export function applyOps(
  rows: EntityRow[],
  ops: readonly Op[],
  userId: string,
  nextSyncId?: () => number,
): EntityRow[] {
  const working = structuredClone(rows)
  const model = new GtdModel(working, nextSyncId)
  for (const op of ops)
    runOp(model, op, userId)
  return model.rows.filter(row => row.entity === 'task' || !row.deleted)
}

export function runOp(model: GtdModel, op: Op, userId: string): void {
  switch (op.kind) {
    case 'transition':
      transition(model, op.taskId, op.action, op.clientTs)
      return
    case 'create':
      runCreate(model, op, userId)
      return
    case 'move':
      runMove(model, op)
      return
    case 'patch':
      runPatch(model, op, userId)
      return
    case 'delete':
      runDelete(model, op)
      return
    case 'purge':
      runPurge(model, op.taskId)
  }
}

function runDelete(model: GtdModel, op: Extract<Op, { kind: 'delete' }>): void {
  if (op.entity === 'task')
    throw new Error('task 不能软删；进回收站用 delete，永久删除用 purge')
  const row = model.rows.find(item => item.entity === op.entity && item.id === op.entityId)
  if (!row)
    throw new Error('要删除的数据不存在，可能已在其他设备上删除')
  if (row.deleted)
    throw new Error('要删除的数据不存在，可能已在其他设备上删除')
  row.deleted = true
  model.touch(row)
}

function runPurge(model: GtdModel, taskId: string): void {
  const task = model.findTask(taskId)
  if (!task)
    throw taskNotFound()
  if (task.data.status !== EXPLICIT_STATUS.DELETED)
    throw new Error(`${taskLabel(task)}不在回收站中，不能永久删除；请从回收站里的上级任务操作`)
  const purged = new Set([taskId, ...subtree(model.tree(), taskId).map(item => item.id)])
  for (let i = model.rows.length - 1; i >= 0; i--) {
    const row = model.rows[i]!
    if (row.entity === 'task' && purged.has(row.id)) {
      model.rows.splice(i, 1)
      continue
    }
    if ((row.entity === 'task_tag' || row.entity === 'attachment') && purged.has(row.data.taskId))
      model.rows.splice(i, 1)
  }
  model.invalidate()
}
