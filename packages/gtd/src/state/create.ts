import type { Op } from '../command/op'
import type { GtdModel } from './model'
import { parentNotFound } from '../command/errors'
import { createTaskData } from '../data/row-schema'
import { propagateUp } from './propagate'

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
