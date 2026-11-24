import type { Op, OpIds } from '../command/op'
import type { GtdModel } from '../state/model'
import { moveTask, resolveOpIds, update } from '../command/op'
import { descendantTaskIds } from '../state/tree'
import { sortedByOrder, targetOrder } from './order'
import { requireTask, siblingsOf } from './shared'
import { copyTagsFromParentOp } from './tags'

export interface MoveTaskDest {
  mountDirId: string | null
  parentId?: string | null
  beforeId?: string | null
  afterId?: string | null
}

export function planMoveTaskOp(
  reader: GtdModel,
  taskId: string,
  dest: MoveTaskDest,
  ids?: OpIds,
): Op[] {
  const task = requireTask(reader, taskId)
  const nextMount = dest.mountDirId
  const nextParent = dest.parentId !== undefined ? dest.parentId : task.data.parentId
  if (nextParent && !nextMount)
    throw new Error('Inbox 不能有子任务')
  const descendantIds = descendantTaskIds(reader.tree(), taskId)
  if (nextMount == null && descendantIds.length > 0)
    throw new Error('有子任务的任务不能移回收件箱')
  if (nextParent === taskId || (nextParent != null && descendantIds.includes(nextParent)))
    throw new Error('不能移到自己的子树下')
  if (
    task.data.mountDirId === nextMount
    && task.data.parentId === nextParent
    && dest.beforeId === undefined
    && dest.afterId === undefined
  ) {
    return []
  }
  const siblings = siblingsOf(reader, nextMount, nextParent, taskId)
  const placed = dest.beforeId !== undefined || dest.afterId !== undefined
    ? targetOrder(siblings, dest.beforeId ?? null, dest.afterId ?? null)
    : targetOrder(siblings, sortedByOrder(siblings).at(-1)?.id ?? null, null)
  const { nowIso } = resolveOpIds(ids)
  const now = nowIso()
  const parentChanged = nextParent !== task.data.parentId
  const items: Op[] = [
    moveTask({ taskId, parentId: nextParent, order: placed.order }, ids),
    update('task', taskId, { mountDirId: nextMount, updatedAt: now }, ids),
  ]
  if (parentChanged)
    items.push(...copyTagsFromParentOp(reader, taskId, nextParent, undefined, ids))
  for (const sib of siblings) {
    const order = placed.reindexed.get(sib.id)
    if (order != null)
      items.push(update('task', sib.id, { order, updatedAt: now }, ids))
  }
  return items
}
