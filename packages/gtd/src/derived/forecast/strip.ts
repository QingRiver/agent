/**
 * 预设条 → 领域 TimeSlice（wiki §1.1.1 分层边界）。
 * 连续点选交互见 apps/client `gtd/forecast-strip.ts`。
 */
import type {
  ForecastOptions,
  ForecastSignalOptions,
  ForecastStripKey,
  TimeSlice,
} from './types'
import { FORECAST_STRIP } from '../../data/types'
import { startOfZonedToday } from '../../time/calendar'
import { dayStartAtOffset, STRIP_DAY_OFFSET } from './strip-offsets'
import { DEFAULT_FORECAST_SIGNALS, DEFAULT_FORECAST_STRIP } from './types'

/**
 * 预设条 → 领域 `TimeSlice` + `includePast`（wiki §1.1.1 分层边界）。
 * 「现在」= 今日有限半开日；「以后」为 `[明天, ∞)`（`end = null`）。
 * 领域归块只认返回的 timeslice，不解释按钮名。
 */
export function stripToTimeSlice(
  strip: readonly ForecastStripKey[],
  now: Date,
  timeZone: string,
): { range: TimeSlice, includePast: boolean } {
  const today = startOfZonedToday(now, timeZone)
  const calendarKeys = strip.filter(k => k !== FORECAST_STRIP.PAST)
  let rangeStart: Date | null = null
  let rangeEnd: Date | null = null
  let openEnded = false

  for (const k of calendarKeys) {
    const offset = STRIP_DAY_OFFSET[k]
    if (offset == null)
      continue
    const day = dayStartAtOffset(today, timeZone, offset)
    const dayEnd = k === FORECAST_STRIP.LATER
      ? null
      : dayStartAtOffset(today, timeZone, offset + 1)
    if (k === FORECAST_STRIP.LATER)
      openEnded = true
    if (rangeStart == null || day.getTime() < rangeStart.getTime())
      rangeStart = day
    if (dayEnd != null) {
      if (rangeEnd == null || dayEnd.getTime() > rangeEnd.getTime())
        rangeEnd = dayEnd
    }
  }

  return {
    includePast: strip.includes(FORECAST_STRIP.PAST),
    range: rangeStart
      ? {
          start: rangeStart.toISOString(),
          end: openEnded ? null : (rangeEnd?.toISOString() ?? null),
        }
      : { start: today.toISOString(), end: today.toISOString() },
  }
}

/** 预设条 + 齿轮信号 → 完整 `ForecastOptions`（`stripToTimeSlice` ⊕ signals） */
export function stripToForecastOptions(
  strip: readonly ForecastStripKey[],
  signals: ForecastSignalOptions,
  now: Date,
  timeZone: string,
): ForecastOptions {
  const { range, includePast } = stripToTimeSlice(strip, now, timeZone)
  return { ...signals, includePast, range }
}

export function defaultForecastOptions(
  now: Date,
  timeZone: string,
  signals: ForecastSignalOptions = DEFAULT_FORECAST_SIGNALS,
): ForecastOptions {
  return stripToForecastOptions(DEFAULT_FORECAST_STRIP, signals, now, timeZone)
}
