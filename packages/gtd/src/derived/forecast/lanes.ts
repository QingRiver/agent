/**
 * Forecast 各栏贡献（wiki §1.1.1 各栏 mermaid）。
 * 栏位正交：只决定本栏有/无；互不整单封杀。
 */
import type { EntityRowOf } from '../../data/sync-schema'
import type { ForecastOptions, LaneHit } from './types'
import { FORECAST_STRIP, PLANNED_MODE } from '../../data/types'
import {
  dayInTimeSlice,
  instantDayStart,
  inTimeSlice,
  relativeDayToSlice,
  startOfZonedToday,
} from '../../time/calendar'
import { isWallClockUnlocked } from '../../time/clock'
import { dayBlockKey } from './block-key'

/**
 * 逾期 / 截止栏（wiki §1.1.1「逾期/截止」mermaid）。
 * 归块按**日历日**相对 timeslice（对齐 OF）；墙钟 overdue 着色仍由 computeStatus 负责。
 * **禁止**与 `COMPUTED_STATUS.OVERDUE`（due < now）合并：栏位 overdue = 截止日 < timeslice.start。
 * - 无 due → 两栏皆空
 * - 已截止（截止日 `< start`）且 `includeOverdue`+`includePast` → 逾期→过去；否则逾期空
 * - 时段内截止且 `includeDue` → 截止→该日
 * - 未到截止 → 截止栏空（**不**整单封杀其它栏）
 * 两侧互斥：至多一侧非 null。
 */
export function laneOverdueDue(
  task: EntityRowOf<'task'>,
  options: ForecastOptions,
  now: Date,
  timeZone: string,
): { overdue: LaneHit | null, due: LaneHit | null } {
  const dueIso = task.data.dueDate
  if (dueIso == null)
    return { overdue: null, due: null }
  const dueMs = new Date(dueIso).getTime()
  const pos = relativeDayToSlice(dueMs, options.range, timeZone)
  const today = startOfZonedToday(now, timeZone)
  if (pos === 'before') {
    if (options.includeOverdue && options.includePast)
      return { overdue: { lane: 'overdue', block: FORECAST_STRIP.PAST }, due: null }
    return { overdue: null, due: null }
  }
  if (pos === 'in' && options.includeDue) {
    const day = instantDayStart(dueMs, timeZone)
    return { overdue: null, due: { lane: 'due', block: dayBlockKey(day, today, timeZone) } }
  }
  return { overdue: null, due: null }
}

/**
 * 推迟栏（wiki §1.1.1「推迟」mermaid）。
 * 有解锁日且解锁**日历日**落在 timeslice、`includeDeferred` 开 → 该日；否则栏空。
 * 用日历日 vs timeslice，**不用**墙钟已解锁（对齐 OF：过期 defer 不进 Past）。
 */
export function laneDeferred(
  task: EntityRowOf<'task'>,
  options: ForecastOptions,
  now: Date,
  timeZone: string,
): LaneHit | null {
  if (!options.includeDeferred || task.data.deferDate == null)
    return null
  const deferMs = new Date(task.data.deferDate).getTime()
  if (!dayInTimeSlice(deferMs, options.range, timeZone))
    return null
  const today = startOfZonedToday(now, timeZone)
  const day = instantDayStart(deferMs, timeZone)
  return { lane: 'deferred', block: dayBlockKey(day, today, timeZone) }
}

/**
 * 计划栏（wiki §1.1.1「计划」mermaid：选日 + 滚动）。
 * - 关 `includePlanned` → 空
 * - 选日：计划**日历日**已过（需 `includePast`→过去）/ 在时段内→该日 / 未到→空；**不受** defer 限制
 * - 滚动：须墙钟已解锁且锚日（时区今日）在 timeslice 内 → 锚日块；否则空
 */
export function lanePlanned(
  task: EntityRowOf<'task'>,
  options: ForecastOptions,
  now: Date,
  timeZone: string,
): LaneHit | null {
  if (!options.includePlanned)
    return null
  const mode = task.data.plannedMode ?? PLANNED_MODE.NONE
  const today = startOfZonedToday(now, timeZone)

  if (mode === PLANNED_MODE.ON) {
    const plannedIso = task.data.plannedDate
    if (plannedIso == null)
      return null
    const plannedMs = new Date(plannedIso).getTime()
    const pos = relativeDayToSlice(plannedMs, options.range, timeZone)
    if (pos === 'before') {
      if (options.includePast)
        return { lane: 'planned', block: FORECAST_STRIP.PAST }
      return null
    }
    if (pos === 'in') {
      const day = instantDayStart(plannedMs, timeZone)
      return { lane: 'planned', block: dayBlockKey(day, today, timeZone) }
    }
    return null
  }

  if (mode === PLANNED_MODE.ROLLING) {
    if (!isWallClockUnlocked(task.data.deferDate, now))
      return null
    if (!inTimeSlice(today.getTime(), options.range))
      return null
    return { lane: 'planned', block: dayBlockKey(today, today, timeZone) }
  }

  return null
}

/**
 * 旗标栏（wiki §1.1.1「旗标」mermaid）。
 * 已旗标且 `includeFlagged`、墙钟已解锁、锚日在 timeslice 内 → 锚日块；否则空。
 */
export function laneFlagged(
  task: EntityRowOf<'task'>,
  options: ForecastOptions,
  now: Date,
  timeZone: string,
): LaneHit | null {
  if (!task.data.flagged || !options.includeFlagged)
    return null
  if (!isWallClockUnlocked(task.data.deferDate, now))
    return null
  const today = startOfZonedToday(now, timeZone)
  if (!inTimeSlice(today.getTime(), options.range))
    return null
  return { lane: 'flagged', block: dayBlockKey(today, today, timeZone) }
}
