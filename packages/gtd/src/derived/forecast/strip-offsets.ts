import type { ForecastStripKey } from './types'
import { FORECAST_STRIP } from '../../data/types'
/**
 * Forecast 命名日相对「今日」的日历偏移（wiki 五段条）。
 * strip / block-key / render 共用，避免 +0/+1/+2/+3 散落。
 */
import { addZonedDays } from '../../time/calendar'

/** 日历预设 → 相对今日的起始日偏移；「以后」为后天+1 */
export const STRIP_DAY_OFFSET: Partial<Record<ForecastStripKey, number>> = {
  [FORECAST_STRIP.TODAY]: 0,
  [FORECAST_STRIP.TOMORROW]: 1,
  [FORECAST_STRIP.DAY_AFTER]: 2,
  [FORECAST_STRIP.LATER]: 3,
}

/** 命名吸顶日（今日/明天/后天）相对今日的偏移 */
export const NAMED_DAY_OFFSETS = [0, 1, 2] as const

export function dayStartAtOffset(today: Date, timeZone: string, offset: number): Date {
  return offset === 0 ? today : addZonedDays(today, timeZone, offset)
}
