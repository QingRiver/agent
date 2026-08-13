/**
 * Forecast 领域类型与常量。
 * SoT：wiki/GTD.md §1.1.1（TimeSlice + 栏位正交 + tier）。
 */
import type { TimeSlice } from '../../time/calendar'
import { FORECAST_STRIP } from '../../data/types'

export type { TimeSlice } from '../../time/calendar'

export type ForecastStripKey = (typeof FORECAST_STRIP)[keyof typeof FORECAST_STRIP]

/** 齿轮信号开关（不含预设条 / timeslice） */
export interface ForecastSignalOptions {
  includeOverdue: boolean
  includeDue: boolean
  includeDeferred: boolean
  includePlanned: boolean
  includeFlagged: boolean
}

export interface ForecastOptions extends ForecastSignalOptions {
  /** TimeSlice：日历窗（定义见 ../time.ts） */
  range: TimeSlice
  includePast: boolean
}

export const DEFAULT_FORECAST_SIGNALS: ForecastSignalOptions = {
  includeOverdue: true,
  includeDue: true,
  includeDeferred: true,
  includePlanned: true,
  includeFlagged: true,
}

/** 默认仅「现在」 */
export const DEFAULT_FORECAST_STRIP: ForecastStripKey[] = [FORECAST_STRIP.NOW]

/** tier 序（高→低），与 wiki「逾期 > 截止 > 推迟 > 计划 > 旗标」一致 */
export const TIER_ORDER = ['overdue', 'due', 'deferred', 'planned', 'flagged'] as const
export type ForecastLane = (typeof TIER_ORDER)[number]

/** 块键：过去，或命名「现在」（今日），或以后某日的时区 `YYYY-MM-DD` */
export type ForecastBlockKey = typeof FORECAST_STRIP.PAST | string

/** 单栏命中：所属 lane + 归入的 Forecast 块 */
export interface LaneHit {
  lane: ForecastLane
  block: ForecastBlockKey
}
