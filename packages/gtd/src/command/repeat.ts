import type { RepeatCycle, RepeatRule, Task } from '../data/schema'
import type { EntityRow, EntityRowOf } from '../data/sync-schema'
import { EXPLICIT_STATUS, REPEAT_ANCHOR, REPEAT_CYCLE } from '../data/types'

/**
 * 重复任务克隆（L5 command）：周期日期推算 + 下一实例克隆。
 *
 * `cloneNextInstance` 是 complete 时克隆下一实例的单一实现，由 `command/state-machine.ts`
 * 的 `completeTask` 在完成旧任务后调用。`shouldStop`（周期耗尽判定）已迁 `time/date-math.ts`。
 * 旧 doc 模型壳 `applyRepeatOnComplete` 已移除（行模型统一经 state-machine）。
 */

const DAY = 86400000

/** 按 cycle/interval 推进日期（UTC，避免时区漂移） */
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

/** weekly 专有：对齐到 daysOfWeek 中下一个允许的星期（含当天） */
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

/** 纯日期推算：按 rule.cycle/interval/anchor 与 task 旧日期算下一实例的 deferDate/dueDate */
export function computeNextDates(
  rule: RepeatRule,
  task: Pick<Task, 'dueDate' | 'deferDate'>,
  now: Date,
): { deferDate: string | null, dueDate: string | null } {
  const base
    = rule.anchor === REPEAT_ANCHOR.COMPLETION
      ? now
      : rule.anchor === REPEAT_ANCHOR.DUE
        ? task.dueDate ? new Date(task.dueDate) : now
        : task.deferDate ? new Date(task.deferDate) : now
  const nextBase = addCycle(base, rule.cycle, rule.interval, rule.daysOfWeek)
  // 保持旧 defer-due 间隔
  const gap
    = task.dueDate && task.deferDate
      ? new Date(task.dueDate).getTime() - new Date(task.deferDate).getTime()
      : null
  if (rule.anchor === REPEAT_ANCHOR.DEFER) {
    const deferDate = nextBase.toISOString()
    const dueDate
      = gap != null ? new Date(nextBase.getTime() + gap).toISOString() : (task.dueDate ?? null)
    return { deferDate, dueDate }
  }
  // COMPLETION / DUE：nextBase 即下一 dueDate
  const dueDate = nextBase.toISOString()
  const deferDate
    = gap != null ? new Date(nextBase.getTime() - gap).toISOString() : (task.deferDate ?? null)
  return { deferDate, dueDate }
}

/**
 * 克隆下一重复实例：新 task 入 rows（或复活同源软删行），复制旧实例 task_tag。
 * 调用方 `completeTask` 已先把旧任务置 COMPLETED + repeatRule.completedOccurrences++。
 * id 复用客户端提议的 nextTaskId；算下一期日期；复制 task_tag 保持标签继承。
 */
export function cloneNextInstance(
  task: EntityRowOf<'task'>,
  rule: RepeatRule,
  nextTaskId: string,
  reviveExisting: EntityRow | null,
  clientTs: string,
  rows: EntityRow[],
  nextSyncId: () => number,
): void {
  const taskId = task.id
  const now = new Date(clientTs)
  const next = computeNextDates(rule, task.data, now)
  const newTaskData = {
    ...task.data,
    id: nextTaskId, // 覆盖 data.id：task.data 含旧 id，新实例要用新 id
    status: EXPLICIT_STATUS.ACTIVE,
    completedAt: null,
    droppedAt: null,
    deferDate: next.deferDate,
    dueDate: next.dueDate,
    repeatedFromTaskId: taskId,
    createdAt: clientTs,
    updatedAt: clientTs,
  }
  if (reviveExisting) {
    reviveExisting.deleted = false
    reviveExisting.data = newTaskData
    reviveExisting.syncId = nextSyncId()
  }
  else {
    rows.push({
      entity: 'task',
      id: nextTaskId,
      userId: task.userId,
      syncId: nextSyncId(),
      deleted: false,
      data: newTaskData,
    })
  }

  // 复制旧实例 task_tag → 新实例（保持标签继承）
  /** 旧实例上未软删的 task_tag，用于复制到新实例。 */
  const sourceTaskTags = rows.filter((r): r is EntityRowOf<'task_tag'> =>
    r.entity === 'task_tag' && r.data.taskId === taskId && !r.deleted)
  for (const tt of sourceTaskTags) {
    const tagId = tt.data.tagId
    if (typeof tagId !== 'string') {
      continue
    }
    const newTagRowId = `${nextTaskId}|${tagId}`
    if (rows.some(r => r.entity === 'task_tag' && r.id === newTagRowId)) {
      continue // 复活场景已有则跳过
    }
    rows.push({
      entity: 'task_tag',
      id: newTagRowId,
      userId: task.userId,
      syncId: nextSyncId(),
      deleted: false,
      data: { taskId: nextTaskId, tagId },
    })
  }
}
