import type { Op } from '../command/op'
import type { GtdModel } from './model'
import { taskLabel, taskNotFound } from '../command/errors'
import { EXPLICIT_STATUS } from '../data/types'
import { subtree } from './tree'

/** 软删非 task 行（task_tag / perspective / attachment）。task 删除走 status=DELETED（transition）。 */
export function runDelete(model: GtdModel, op: Extract<Op, { kind: 'delete' }>): void {
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

/** 永久删除回收站任务及其子孙与关联行（task_tag / attachment）。 */
export function runPurge(model: GtdModel, taskId: string): void {
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
