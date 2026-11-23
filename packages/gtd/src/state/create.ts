import type { Op, OpIds } from '../op'
import type { GtdModel } from './model'
import { createTaskData } from '../data/row-schema'
import { parentNotFound } from '../errors'
import { stamp } from '../op'
import { propagateUp } from '../transition'

export interface CreateTaskInput {
  taskId: string
  name: string
  parentId: string | null
  order: number
  mountDirId: string | null
}

/** 建一个点，收成 create Op。 */
export function createTask(input: CreateTaskInput, ids?: OpIds): Op {
  const { id, clientTs } = stamp(ids)
  return { kind: 'create', id, clientTs, ...input }
}

export function runCreate(model: GtdModel, op: Extract<Op, { kind: 'create' }>, userId: string): void {
  if (model.rows.some(row => row.entity === 'task' && row.id === op.taskId))
    throw new Error(`task ${op.taskId} already exists`)
  if (op.parentId != null && !model.findLive('task', op.parentId))
    throw parentNotFound()
  model.rows.push({
    entity: 'task',
    id: op.taskId,
    userId,
    syncId: model.nextSyncId(),
    deleted: false,
    data: createTaskData({
      name: op.name,
      mountDirId: op.mountDirId,
      parentId: op.parentId,
      order: op.order,
      createdAt: op.clientTs,
      updatedAt: op.clientTs,
    }),
  })
  model.invalidate()
  propagateUp(model, op.taskId, { kind: 'descendant-activated' }, op.clientTs)
}
