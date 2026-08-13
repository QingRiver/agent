import type { ForecastStripKey } from './types'
import { FORECAST_STRIP } from '../../data/types'
/**
 * Forecast 命名日相对「今日」的日历偏移（三段条：过去 / 现在 / 以后）。
 * strip / block-key / render 共用，避免 +0/+1 散落。
 */
import { addZonedDays } from '../../time/calendar'

/** 日历预设 → 相对今日的起始日偏移；「以后」从明天起开窗 */
export const STRIP_DAY_OFFSET: Partial<Record<ForecastStripKey, number>> = {
  [FORECAST_STRIP.NOW]: 0,
  [FORECAST_STRIP.LATER]: 1,
}

/** 命名吸顶日（仅「现在」= 今日）相对今日的偏移 */
export const NAMED_DAY_OFFSETS = [0] as const

export function dayStartAtOffset(today: Date, timeZone: string, offset: number): Date {
  return offset === 0 ? today : addZonedDays(today, timeZone, offset)
}
