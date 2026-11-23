import type { GroupType, RepeatRule, Task } from '../data/schema'
import type { Op, OpIds } from '../op'
import type { GtdModel } from '../state/model'
import type { StatusAction } from '../transition'
import { EXPLICIT_STATUS, GROUP_TYPE, REPEAT_ANCHOR } from '../data/types'
import { purgeOp, resolveOpIds, transitionOp } from '../op'
import { createTask } from '../state/create'
import { orderBetween } from '../state/order'
import { descendantTaskIds } from '../state/tree'
import { moveTask, update } from '../state/update'
import { normalizeDeferDue } from '../time/normalize'
import { nextOrder, sortedByOrder, targetOrder } from './order'
import { copyTagsFromParentOp } from './tags'

function tShape(s: { id: string, data: { order: number, groupType?: GroupType | null, mountDirId?: string | null, parentId?: string | null } }) {
  return { id: s.id, ...s.data }
}

function requireTask(reader: GtdModel, taskId: string) {
  const task = reader.findLive('task', taskId)
  if (!task)
    throw new Error('任务不存在')
  return task
}

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
  const order = nextOrder(
    reader.liveTasks()
      .filter(t => t.data.mountDirId == null && t.data.parentId == null)
      .map(tShape),
  )
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
  const siblings = reader.liveTasks()
    .filter(t => t.data.mountDirId === mountDirId && t.data.parentId == null)
    .map(tShape)
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
  if (reader.effectiveStatusOf(parentId) !== EXPLICIT_STATUS.ACTIVE)
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
  if (reader.effectiveStatusOf(taskId) !== EXPLICIT_STATUS.ACTIVE)
    throw new Error('任务非活跃状态，不允许缩进')
  const siblings = sortedByOrder(reader.liveTasks().filter(t =>
    t.data.mountDirId === task.data.mountDirId && t.data.parentId === task.data.parentId,
  ).map(tShape))
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
  if (reader.effectiveStatusOf(taskId) !== EXPLICIT_STATUS.ACTIVE)
    throw new Error('任务非活跃状态，不允许移出')
  const parentSiblings = sortedByOrder(reader.liveTasks().filter(t =>
    t.data.mountDirId === parent.data.mountDirId && t.data.parentId === parent.data.parentId && t.id !== taskId,
  ).map(tShape))
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
  const siblings = reader.liveTasks().filter(t =>
    t.id !== taskId
    && t.data.mountDirId === task.data.mountDirId
    && t.data.parentId === task.data.parentId,
  ).map(tShape)
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
  const siblings = reader.liveTasks()
    .filter(t => t.id !== taskId && t.data.mountDirId === nextMount && t.data.parentId === nextParent)
    .map(tShape)
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

export function planPatchTaskOp(
  reader: GtdModel,
  taskId: string,
  patch: Partial<Task>,
  ids?: OpIds,
): Op[] {
  const task = requireTask(reader, taskId)
  if (Object.hasOwn(patch, 'mountDirId') || Object.hasOwn(patch, 'parentId') || Object.hasOwn(patch, 'order'))
    throw new Error('换项目或排序请用 moveTask / reorderTask')
  const rule = task.data.repeatRuleId != null ? task.data.repeatRule : null
  if (rule?.anchor === REPEAT_ANCHOR.DUE && patch.dueDate === null)
    throw new Error('按截止日重复的任务不能清空截止日期')
  if (rule?.anchor === REPEAT_ANCHOR.DEFER && patch.deferDate === null)
    throw new Error('按推迟日重复的任务不能清空推迟日期')
  const { id: _id, repeatRuleId: _rid, ...rest } = patch
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

export type RepeatRuleInput = Omit<RepeatRule, 'id' | 'completedOccurrences'>

export function planSetTaskRepeatOp(
  reader: GtdModel,
  taskId: string,
  input: RepeatRuleInput | null,
  ids?: OpIds,
): Op[] {
  const task = requireTask(reader, taskId)
  if (input?.anchor === REPEAT_ANCHOR.DUE && !task.data.dueDate)
    throw new Error('按截止日重复前，请先设置截止日期')
  if (input?.anchor === REPEAT_ANCHOR.DEFER && !task.data.deferDate)
    throw new Error('按推迟日重复前，请先设置推迟日期')
  const { newId, nowIso } = resolveOpIds(ids)
  const now = nowIso()
  if (!input) {
    return [update('task', taskId, { repeatRuleId: null, repeatRule: null, updatedAt: now }, ids)]
  }
  const existing = task.data.repeatRule
  const shared = existing
    ? reader.liveTasks().some(t => t.id !== taskId && t.data.repeatRuleId === existing.id)
    : false
  const id = existing && !shared ? existing.id : newId()
  const rule: RepeatRule = {
    ...input,
    id,
    completedOccurrences: existing?.completedOccurrences ?? 0,
  }
  return [update('task', taskId, { repeatRuleId: id, repeatRule: rule, updatedAt: now }, ids)]
}
