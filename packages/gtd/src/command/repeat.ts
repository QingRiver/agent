import type { TaskRow } from '../data/rows'
import type { RepeatCycle, RepeatRule, Task } from '../data/schema'
import type { GtdModel } from '../state/model'
import { match, P } from 'ts-pattern'
import { EXPLICIT_STATUS, REPEAT_ANCHOR, REPEAT_CYCLE } from '../data/types'
import { orderBetween, shouldReindex } from '../state/order'
import { propagateUp } from '../state/propagate'
import { shouldStop } from '../time/date-math'

const DAY = 86400000

function addCycle(
  date: Date,
  cycle: RepeatCycle,
  interval: number,
  daysOfWeek: number[] = [],
): Date {
  switch (cycle) {
    case REPEAT_CYCLE.DAILY:
      return new Date(date.getTime() + interval * DAY)
    case REPEAT_CYCLE.WEEKLY: {
      const base = new Date(date.getTime() + interval * 7 * DAY)
      if (daysOfWeek.length === 0)
        return base
      return alignToNextDayOfWeek(base, daysOfWeek)
    }
    case REPEAT_CYCLE.MONTHLY: {
      const d = new Date(date)
      d.setUTCMonth(d.getUTCMonth() + interval)
      return d
    }
    case REPEAT_CYCLE.YEARLY: {
      const d = new Date(date)
      d.setUTCFullYear(d.getUTCFullYear() + interval)
      return d
    }
  }
}

function alignToNextDayOfWeek(date: Date, daysOfWeek: number[]): Date {
  const allowed = new Set(daysOfWeek)
  const d = new Date(date)
  for (let i = 0; i < 8; i++) {
    if (allowed.has(d.getUTCDay()))
      return d
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return d
}

/** 按规则锚点和周期推下一实例的 defer / due。 */
export function computeNextDates(
  rule: RepeatRule,
  task: Pick<Task, 'dueDate' | 'deferDate'>,
  now: Date,
): { deferDate: string | null, dueDate: string | null } {
  const base = match(rule.anchor)
    .with(REPEAT_ANCHOR.COMPLETION, () => now)
    .with(REPEAT_ANCHOR.DUE, () => task.dueDate ? new Date(task.dueDate) : now)
    .with(REPEAT_ANCHOR.DEFER, () => task.deferDate ? new Date(task.deferDate) : now)
    .exhaustive()
  const nextBase = addCycle(base, rule.cycle, rule.interval, rule.daysOfWeek)
  const gap
    = task.dueDate && task.deferDate
      ? new Date(task.dueDate).getTime() - new Date(task.deferDate).getTime()
      : null
  return match(rule.anchor)
    .with(REPEAT_ANCHOR.DEFER, () => {
      const deferDate = nextBase.toISOString()
      const dueDate
        = gap != null ? new Date(nextBase.getTime() + gap).toISOString() : (task.dueDate ?? null)
      return { deferDate, dueDate }
    })
    .with(P.union(REPEAT_ANCHOR.COMPLETION, REPEAT_ANCHOR.DUE), () => {
      const dueDate = nextBase.toISOString()
      const deferDate
        = gap != null ? new Date(nextBase.getTime() - gap).toISOString() : (task.deferDate ?? null)
      return { deferDate, dueDate }
    })
    .exhaustive()
}

/** 第 occurrence 次完成后的下一实例 id，只由规则 id 和次数决定。 */
export function repeatSuccessorId(repeatRuleId: string, occurrence: number): string {
  return `${repeatRuleId}#${occurrence}`
}

function successorOrder(model: GtdModel, task: TaskRow, nextTaskId: string): number {
  const { mountDirId, parentId, order } = task.data
  const siblingOrders = model.liveTasks()
    .filter(row =>
      row.id !== task.id && row.id !== nextTaskId
      && row.data.mountDirId === mountDirId && row.data.parentId === parentId)
    .map(row => row.data.order)
  const after = siblingOrders.filter(value => value > order).sort((a, b) => a - b)[0] ?? null
  if (after == null || !shouldReindex(order, after))
    return orderBetween(order, after)
  return orderBetween(Math.max(order, ...siblingOrders), null)
}

/**
 * complete 的 local：周期未尽则克隆下一实例，再向上传播。
 * 后继已经活着时不再克隆、也不再累加次数。
 */
export function cloneIfRepeating(model: GtdModel, task: TaskRow, ts: string): void {
  const rule = task.data.repeatRule
  if (rule == null || shouldStop(rule, new Date(ts)))
    return

  const nextTaskId = repeatSuccessorId(rule.id, rule.completedOccurrences + 1)
  const existing = model.rows.find((row): row is TaskRow => row.entity === 'task' && row.id === nextTaskId)
  if (existing) {
    if (existing.data.repeatedFromTaskId !== task.id)
      throw new Error(`nextTaskId ${nextTaskId} occupied by different source`)
    return
  }

  const dates = computeNextDates(rule, task.data, new Date(ts))
  task.data.repeatRule = { ...rule, completedOccurrences: rule.completedOccurrences + 1 }
  const sourceData = task.data
  const newTaskData = {
    ...sourceData,
    order: successorOrder(model, task, nextTaskId),
    status: EXPLICIT_STATUS.ACTIVE,
    statusChangedAt: null,
    deferDate: dates.deferDate,
    dueDate: dates.dueDate,
    repeatedFromTaskId: task.id,
    createdAt: ts,
    updatedAt: ts,
  }

  model.rows.push({
    entity: 'task',
    id: nextTaskId,
    userId: task.userId,
    syncId: model.nextSyncId(),
    deleted: false,
    data: newTaskData,
  })

  for (const tag of model.liveTaskTags().filter(row => row.data.taskId === task.id)) {
    const tagId = tag.data.tagId
    if (typeof tagId !== 'string')
      continue
    const id = `${nextTaskId}|${tagId}`
    if (model.rows.some(row => row.entity === 'task_tag' && row.id === id))
      continue
    model.rows.push({
      entity: 'task_tag',
      id,
      userId: task.userId,
      syncId: model.nextSyncId(),
      deleted: false,
      data: { taskId: nextTaskId, tagId },
    })
  }

  model.invalidate()
  propagateUp(model, nextTaskId, { kind: 'descendant-activated' }, ts)
}
