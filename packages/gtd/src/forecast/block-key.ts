/**
 * 日历日始 → Forecast 块键（今日/明天/后天命名，更远日用时区 `YYYY-MM-DD`）。
 * 依赖 FORECAST_STRIP，故留在 forecast 层；窗几何在 ../time.ts。
 */
import type { ForecastBlockKey } from './types'
import { formatZonedYmd } from '../time'
import { FORECAST_STRIP } from '../types'
import { dayStartAtOffset, NAMED_DAY_OFFSETS } from './strip-offsets'

export function dayBlockKey(dayStart: Date, today: Date, timeZone: string): ForecastBlockKey {
  const d = dayStart.getTime()
  if (d === dayStartAtOffset(today, timeZone, NAMED_DAY_OFFSETS[0]).getTime())
    return FORECAST_STRIP.TODAY
  if (d === dayStartAtOffset(today, timeZone, NAMED_DAY_OFFSETS[1]).getTime())
    return FORECAST_STRIP.TOMORROW
  if (d === dayStartAtOffset(today, timeZone, NAMED_DAY_OFFSETS[2]).getTime())
    return FORECAST_STRIP.DAY_AFTER
  return formatZonedYmd(dayStart, timeZone)
}
