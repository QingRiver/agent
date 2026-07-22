import type { GtdDocument, RepeatCycle, RepeatRule, Task } from './schema'
import { EXPLICIT_STATUS, REPEAT_ANCHOR, REPEAT_CYCLE } from './types'

/**
 * 重复任务克隆。
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

/** 是否终止重复（completedOccurrences>=maxOccurrences 或 now>endDate） */
export function shouldStop(rule: RepeatRule, now: Date): boolean {
  if (rule.maxOccurrences != null && rule.completedOccurrences >= rule.maxOccurrences)
    return true
  if (rule.endDate && now.getTime() > new Date(rule.endDate).getTime())
    return true
  return false
}

/** Task 完成时克隆下一实例：新 task 入 doc.tasks，旧 task.repeatRule.completedOccurrences++ */
export function applyRepeatOnComplete(doc: GtdDocument, task: Task, now: Date): GtdDocument {
  if (!task.repeatRuleId)
    return doc
  const rule = doc.repeatRules.find(r => r.id === task.repeatRuleId)
  if (!rule || shouldStop(rule, now))
    return doc
  const next = computeNextDates(rule, task, now)
  const newTask: Task = {
    ...task,
    id: crypto.randomUUID(),
    status: EXPLICIT_STATUS.ACTIVE,
    completedAt: null,
    droppedAt: null,
    deferDate: next.deferDate,
    dueDate: next.dueDate,
    repeatedFromTaskId: task.id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
  return {
    ...doc,
    tasks: [...doc.tasks, newTask],
    repeatRules: doc.repeatRules.map(r =>
      r.id === rule.id ? { ...r, completedOccurrences: r.completedOccurrences + 1 } : r,
    ),
  }
}
