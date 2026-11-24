import type { Op, OpIds } from '../command/op'
import type { StatusAction } from '../command/transition'
import type { GroupType, Task } from '../data/schema'
import type { GtdModel } from '../state/model'
import { createTask, moveTask, purgeOp, resolveOpIds, transitionOp, update } from '../command/op'
import { EXPLICIT_STATUS, GROUP_TYPE, REPEAT_ANCHOR } from '../data/types'
import { orderBetween } from '../state/order'
import { normalizeDeferDue } from '../time/normalize'
import { nextOrder, sortedByOrder, targetOrder } from './order'
import { requireTask, siblingsOf, tShape } from './shared'
import { copyTagsFromParentOp } from './tags'

export function planAddInboxTaskOp(
  reader: GtdModel,
  name: string,
  ids?: OpIds,
): Op[] {
  const trimmed = name.trim()
  if (!trimmed)
    return []
  const { newId } = resolveOpIds(ids)
  const id = newId()
  const order = nextOrder(siblingsOf(reader, null, null))
  return [createTask({
    taskId: id,
    name: trimmed,
    parentId: null,
    order,
    mountDirId: null,
  }, ids)]
}

export function planAddProjectTaskOp(
  reader: GtdModel,
  mountDirId: string,
  name: string,
  ids?: OpIds,
): Op[] {
  const trimmed = name.trim()
  if (!trimmed)
    return []
  const { newId } = resolveOpIds(ids)
  const id = newId()
  const siblings = siblingsOf(reader, mountDirId, null)
  return [createTask({
    taskId: id,
    name: trimmed,
    parentId: null,
    order: nextOrder(siblings),
    mountDirId,
  }, ids)]
}

export function planAddChildTaskOp(
  reader: GtdModel,
  parentId: string,
  name: string,
  ids?: OpIds,
): Op[] {
  const trimmed = name.trim()
  if (!trimmed)
    return []
  const parent = reader.findLive('task', parentId)
  if (!parent)
    throw new Error('父任务不存在')
  if (!parent.data.mountDirId)
    throw new Error('Inbox 任务需先移入项目，才能添加子任务')
  if (reader.effectiveStatus(parentId) !== EXPLICIT_STATUS.ACTIVE)
    throw new Error('父任务非活跃状态，不允许添加子任务')
  const { newId, nowIso } = resolveOpIds(ids)
  const now = nowIso()
  const id = newId()
  const children = reader.liveTasks().filter(t => t.data.parentId === parentId).map(tShape)
  const items: Op[] = [
    createTask({
      taskId: id,
      name: trimmed,
      parentId,
      order: nextOrder(children),
      mountDirId: parent.data.mountDirId,
    }, ids),
    ...copyTagsFromParentOp(reader, id, parentId, [], ids),
  ]
  if (!parent.data.groupType)
    items.push(update('task', parentId, { groupType: GROUP_TYPE.PARALLEL, updatedAt: now }, ids))
  return items
}

export function planIndentTaskOp(
  reader: GtdModel,
  taskId: string,
  ids?: OpIds,
): Op[] {
  const task = requireTask(reader, taskId)
  if (!task.data.mountDirId)
    throw new Error('Inbox 任务不能缩进')
  if (reader.effectiveStatus(taskId) !== EXPLICIT_STATUS.ACTIVE)
    throw new Error('任务非活跃状态，不允许缩进')
  const siblings = sortedByOrder(siblingsOf(reader, task.data.mountDirId, task.data.parentId))
  const index = siblings.findIndex(t => t.id === taskId)
  const parent = index > 0 ? siblings[index - 1]! : null
  if (!parent)
    throw new Error('当前任务前面没有可作为父级的任务')
  const { nowIso } = resolveOpIds(ids)
  const now = nowIso()
  const children = reader.liveTasks().filter(t => t.data.parentId === parent.id && t.id !== taskId).map(tShape)
  const items: Op[] = [
    moveTask({ taskId, parentId: parent.id, order: nextOrder(children) }, ids),
    update('task', taskId, { updatedAt: now }, ids),
    ...copyTagsFromParentOp(reader, taskId, parent.id, undefined, ids),
  ]
  if (!parent.groupType)
    items.push(update('task', parent.id, { groupType: GROUP_TYPE.PARALLEL, updatedAt: now }, ids))
  return items
}

export function planOutdentTaskOp(
  reader: GtdModel,
  taskId: string,
  ids?: OpIds,
): Op[] {
  const task = requireTask(reader, taskId)
  const parentId = task.data.parentId
  const parent = parentId ? reader.findLive('task', parentId) : null
  if (!parent)
    throw new Error('当前任务已经是项目顶层任务')
  if (reader.effectiveStatus(taskId) !== EXPLICIT_STATUS.ACTIVE)
    throw new Error('任务非活跃状态，不允许移出')
  const parentSiblings = sortedByOrder(siblingsOf(reader, parent.data.mountDirId, parent.data.parentId, taskId))
  const parentIndex = parentSiblings.findIndex(t => t.id === parent.id)
  const after = parentIndex >= 0 ? parentSiblings[parentIndex + 1] ?? null : null
  const remainingChildren = reader.liveTasks().filter(t => t.data.parentId === parent.id && t.id !== taskId)
  const { nowIso } = resolveOpIds(ids)
  const now = nowIso()
  const items: Op[] = [
    moveTask({
      taskId,
      parentId: parent.data.parentId,
      order: orderBetween(parent.data.order, after?.order ?? null),
    }, ids),
    update('task', taskId, { updatedAt: now }, ids),
  ]
  if (remainingChildren.length === 0)
    items.push(update('task', parent.id, { groupType: null, updatedAt: now }, ids))
  return items
}

export function planSetTaskGroupTypeOp(
  reader: GtdModel,
  taskId: string,
  type: GroupType | null,
  ids?: OpIds,
): Op[] {
  requireTask(reader, taskId)
  const hasChildren = reader.liveTasks().some(t => t.data.parentId === taskId)
  if (hasChildren && type == null)
    throw new Error('有子任务的任务组不能转换为普通任务')
  const { nowIso } = resolveOpIds(ids)
  return [update('task', taskId, { groupType: type, updatedAt: nowIso() }, ids)]
}

export function planReorderTaskOp(
  reader: GtdModel,
  taskId: string,
  target: { beforeId: string | null, afterId: string | null },
  ids?: OpIds,
): Op[] {
  const task = requireTask(reader, taskId)
  const siblings = siblingsOf(reader, task.data.mountDirId, task.data.parentId, taskId)
  const result = targetOrder(siblings, target.beforeId, target.afterId)
  const { nowIso } = resolveOpIds(ids)
  const now = nowIso()
  const items: Op[] = [
    update('task', taskId, { order: result.order, updatedAt: now }, ids),
  ]
  for (const sib of siblings) {
    const order = result.reindexed.get(sib.id)
    if (order != null)
      items.push(update('task', sib.id, { order, updatedAt: now }, ids))
  }
  return items
}

export function planStatusOp(
  reader: GtdModel,
  action: StatusAction,
  taskId: string,
  ids?: OpIds,
): Op[] {
  requireTask(reader, taskId)
  return [transitionOp(action, taskId, ids)]
}

export function planPurgeTasksOp(taskIds: string[]): Op[] {
  return taskIds.map(taskId => purgeOp(taskId))
}

export function planToggleFlagOp(
  reader: GtdModel,
  taskId: string,
  ids?: OpIds,
): Op[] {
  const task = requireTask(reader, taskId)
  const { nowIso } = resolveOpIds(ids)
  return [update('task', taskId, { flagged: !task.data.flagged, updatedAt: nowIso() }, ids)]
}

export function planPatchTaskOp(
  reader: GtdModel,
  taskId: string,
  patch: Partial<Task>,
  ids?: OpIds,
): Op[] {
  const task = requireTask(reader, taskId)
  if (Object.hasOwn(patch, 'mountDirId') || Object.hasOwn(patch, 'parentId') || Object.hasOwn(patch, 'order'))
    throw new Error('换项目或排序请用 moveTask / reorderTask')
  const rule = task.data.repeatRule
  if (rule?.anchor === REPEAT_ANCHOR.DUE && patch.dueDate === null)
    throw new Error('按截止日重复的任务不能清空截止日期')
  if (rule?.anchor === REPEAT_ANCHOR.DEFER && patch.deferDate === null)
    throw new Error('按推迟日重复的任务不能清空推迟日期')
  const { id: _id, ...rest } = patch
  const datePatch: { deferDate?: string | null, dueDate?: string | null } = {}
  if (Object.hasOwn(patch, 'deferDate'))
    datePatch.deferDate = patch.deferDate ?? null
  if (Object.hasOwn(patch, 'dueDate'))
    datePatch.dueDate = patch.dueDate ?? null
  const dates = Object.keys(datePatch).length > 0
    ? normalizeDeferDue(
        { deferDate: task.data.deferDate, dueDate: task.data.dueDate },
        datePatch,
      )
    : null
  const { nowIso } = resolveOpIds(ids)
  return [update('task', taskId, {
    ...rest,
    ...(dates ?? {}),
    updatedAt: nowIso(),
  }, ids)]
}
