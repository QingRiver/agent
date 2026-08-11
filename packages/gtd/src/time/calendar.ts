/**
 * 日历日界与 TimeSlice 几何：用户时区。
 *
 * 墙钟瞬时比较（defer 是否已过、墙钟已解锁）见 `./clock`，与本文件日历日界正交，勿混用。
 * repeat / review 周期推进仍用 UTC 日期算术（见 command/repeat.ts / review.ts）。
 *
 * SoT：wiki/GTD.md §1.1.1–1.1.2。
 */

/** 半开日窗；`end == null` 表示开到未来无穷 */
export interface TimeSlice {
  start: string
  end: string | null
}

function getZonedDateParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  const parts = Object.fromEntries(
    dtf.formatToParts(date)
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value]),
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday ?? 'Mon',
  }
}

/** 用户时区日历日 → `YYYY-MM-DD`（Forecast 远日块键/标签，避免 UTC ISO 错日） */
export function formatZonedYmd(date: Date, timeZone: string): string {
  const { year, month, day } = getZonedDateParts(date, timeZone)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** 用户时区瞬时 → `YYYY-MM-DD HH:mm`（透视日期分组标题） */
export function formatZonedYmdHm(date: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    dtf.formatToParts(date)
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    dtf.formatToParts(date)
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value]),
  )
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return asUtc - date.getTime()
}

/** 用户时区某日历日的 00:00:00.000 对应 UTC 时刻 */
export function startOfZonedDay(date: Date, timeZone: string): Date {
  const { year, month, day } = getZonedDateParts(date, timeZone)
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const offset = getTimeZoneOffsetMs(noonUtc, timeZone)
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offset)
}

/**
 * 时区 `YYYY-MM-DD` → 该日日始（UTC 瞬时）。
 * 经 noon 锚定再 `startOfZonedDay`，抗 DST。
 */
export function startOfZonedYmd(ymd: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m)
    throw new Error(`invalid zoned YMD: ${ymd}`)
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  return startOfZonedDay(noonUtc, timeZone)
}

/** 在用户时区日历上加减整天（经 noon 锚定，抗 DST） */
export function addZonedDays(base: Date, timeZone: string, days: number): Date {
  const { year, month, day } = getZonedDateParts(base, timeZone)
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0))
  return startOfZonedDay(shifted, timeZone)
}

export function startOfZonedToday(now: Date, timeZone: string): Date {
  return startOfZonedDay(now, timeZone)
}

/** 瞬时所落日历日的日始（用户时区） */
export function instantDayStart(isoMs: number, timeZone: string): Date {
  return startOfZonedDay(new Date(isoMs), timeZone)
}

/** 瞬时是否落在半开 timeslice：`[start, end)`；`end == null` 时仅要求 `≥ start` */
export function inTimeSlice(ms: number, slice: TimeSlice): boolean {
  const startMs = new Date(slice.start).getTime()
  if (ms < startMs)
    return false
  if (slice.end == null)
    return true
  return ms < new Date(slice.end).getTime()
}

/**
 * 瞬时相对 timeslice：`< start` → before；落在窗内 → in；有限 `end` 且 `≥ end` → after（未到）。
 */
export function relativeToSlice(ms: number, slice: TimeSlice): 'before' | 'in' | 'after' {
  const startMs = new Date(slice.start).getTime()
  if (ms < startMs)
    return 'before'
  if (slice.end != null && ms >= new Date(slice.end).getTime())
    return 'after'
  return 'in'
}

/**
 * Forecast 归块用：先取瞬时所在**日历日日始**，再相对 timeslice（对齐 OF：按日上块，不按时分卡窗）。
 */
export function relativeDayToSlice(
  isoMs: number,
  slice: TimeSlice,
  timeZone: string,
): 'before' | 'in' | 'after' {
  return relativeToSlice(instantDayStart(isoMs, timeZone).getTime(), slice)
}

/** 该瞬时所在日历日日始是否落在 timeslice 内（Forecast 推迟/计划等按日命中） */
export function dayInTimeSlice(isoMs: number, slice: TimeSlice, timeZone: string): boolean {
  return inTimeSlice(instantDayStart(isoMs, timeZone).getTime(), slice)
}

function weekdayIndex(weekday: string): number {
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return map[weekday] ?? 0
}

/** 用户时区本周一 00:00 */
export function startOfZonedWeek(date: Date, timeZone: string): Date {
  const parts = getZonedDateParts(date, timeZone)
  const dayIdx = weekdayIndex(parts.weekday)
  const mondayOffset = dayIdx === 0 ? -6 : 1 - dayIdx
  return addZonedDays(startOfZonedDay(date, timeZone), timeZone, mondayOffset)
}

/** 用户时区本周日结束时刻（该日 23:59:59.999） */
export function endOfZonedWeek(date: Date, timeZone: string): Date {
  const start = startOfZonedWeek(date, timeZone)
  const endDay = addZonedDays(start, timeZone, 6)
  return new Date(addZonedDays(endDay, timeZone, 1).getTime() - 1)
}
