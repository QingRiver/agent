/**
 * 日历日始 → Forecast 块键（今日命名为「现在」，更远日用时区 `YYYY-MM-DD`）。
 * 依赖 FORECAST_STRIP，故留在 forecast 层；窗几何在 ../time.ts。
 */
import type { ForecastBlockKey } from './types'
import { FORECAST_STRIP } from '../../data/types'
import { formatZonedYmd } from '../../time/calendar'
import { dayStartAtOffset, NAMED_DAY_OFFSETS } from './strip-offsets'

export function dayBlockKey(dayStart: Date, today: Date, timeZone: string): ForecastBlockKey {
  const d = dayStart.getTime()
  if (d === dayStartAtOffset(today, timeZone, NAMED_DAY_OFFSETS[0]).getTime())
    return FORECAST_STRIP.NOW
  return formatZonedYmd(dayStart, timeZone)
}
