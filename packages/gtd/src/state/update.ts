import type { EntityRow, GtdEntity } from '../data/row-schema'
import type { Op, OpIds } from '../op'
import type { GtdModel } from './model'
import { EXPLICIT_STATUS } from '../data/types'
import { parentNotFound, taskLabel, taskNotFound } from '../errors'
import { stamp } from '../op'
import { normalizeDeferDue } from '../time/normalize'
import { propagateUp } from '../transition'
import { ancestors } from './tree'

/** 改父节点，收成 move Op。 */
export function moveTask(
  input: { taskId: string, parentId: string | null, order: number },
  ids?: OpIds,
): Op {
  const { id, clientTs } = stamp(ids)
  return { kind: 'move', id, clientTs, ...input }
}

/** 改点上的字段（以及标签、透视等非任务行），收成 patch Op。 */
export function update(
  entity: GtdEntity,
  entityId: string,
  patch: Record<string, unknown>,
  ids?: OpIds,
): Op {
  const { id, clientTs } = stamp(ids)
  return { kind: 'patch', id, clientTs, entity, entityId, patch } as Op
}

export function runMove(model: GtdModel, op: Extract<Op, { kind: 'move' }>): void {
  const task = model.findTask(op.taskId)
  if (!task)
    throw taskNotFound()
  if (op.parentId != null && !model.findLive('task', op.parentId))
    throw parentNotFound()
  if (op.parentId != null) {
    if (op.parentId === op.taskId || ancestors(model.tree(), op.parentId).some(ancestor => ancestor.id === op.taskId))
      throw new Error(`${taskLabel(task)}不能移到自己或自己的子任务下面`)
  }
  task.data.parentId = op.parentId
  task.data.order = op.order
  model.touch(task)
  model.invalidate()
  if (task.data.status === EXPLICIT_STATUS.ACTIVE)
    propagateUp(model, op.taskId, { kind: 'descendant-activated' }, op.clientTs)
}

export function runPatch(model: GtdModel, op: Extract<Op, { kind: 'patch' }>, userId: string): void {
  if (op.entity === 'task' && ('status' in op.patch || 'parentId' in op.patch || 'statusChangedAt' in op.patch))
    throw new Error('status 与 parentId 不能通过补丁修改')
  if (op.entity === 'task_tag') {
    const taskId = op.patch.taskId
    if (typeof taskId === 'string' && !model.findLive('task', taskId))
      throw taskNotFound()
  }
  const row = model.rows.find(item => item.entity === op.entity && item.id === op.entityId)
  if (row) {
    if (row.entity === 'task') {
      if (row.data.status === EXPLICIT_STATUS.DELETED)
        throw new Error(`${taskLabel(row)}在回收站中，不能修改`)
      const before = { deferDate: row.data.deferDate ?? null, dueDate: row.data.dueDate ?? null }
      row.data = { ...row.data, ...op.patch } as typeof row.data
      if (Object.hasOwn(op.patch, 'deferDate') || Object.hasOwn(op.patch, 'dueDate')) {
        const norm = normalizeDeferDue(before, op.patch as { deferDate?: string | null, dueDate?: string | null })
        row.data.deferDate = norm.deferDate
        row.data.dueDate = norm.dueDate
      }
    }
    else {
      row.data = { ...row.data, ...op.patch } as typeof row.data
      row.deleted = false
    }
    model.touch(row)
    return
  }
  if (op.entity === 'task')
    throw new Error('任务不存在（新建任务用 create）')
  model.rows.push({
    entity: op.entity,
    id: op.entityId,
    userId,
    syncId: model.nextSyncId(),
    deleted: false,
    data: { ...op.patch },
  } as EntityRow)
}
