import type { ForecastSignalOptions, ForecastStripKey } from '.'
import { DEFAULT_FORECAST_SIGNALS, stripToForecastOptions } from '.'
/**
 * Forecast 单测共享：日期锚点 + strip→options。
 */
import { NOW } from '../__tests__/fixtures'
import { FORECAST_STRIP } from '../types'

export const TZ = 'UTC'
export const TODAY = '2026-07-16T10:00:00.000Z'
export const YESTERDAY = '2026-07-15T10:00:00.000Z'
export const TOMORROW = '2026-07-17T10:00:00.000Z'
export const DAY_AFTER = '2026-07-18T10:00:00.000Z'
export const LATER_DAY = '2026-07-23T10:00:00.000Z'
export const NEXT_WEEK_DEFER = '2026-07-23T00:00:00.000Z'

export function opts(
  strip: ForecastStripKey[],
  signals: ForecastSignalOptions = DEFAULT_FORECAST_SIGNALS,
  now: Date = NOW,
  timeZone: string = TZ,
) {
  return stripToForecastOptions(strip, signals, now, timeZone)
}

export { DEFAULT_FORECAST_SIGNALS, FORECAST_STRIP, NOW }
