import { describe, expect, it } from 'vitest'
import { NOW } from './__tests__/fixtures'
import { formatZonedYmd, formatZonedYmdHm, inTimeSlice, isWallClockUnlocked, relativeDayToSlice, relativeToSlice, startOfZonedYmd } from './time'

const YESTERDAY = '2026-07-15T10:00:00.000Z'
const TOMORROW = '2026-07-17T10:00:00.000Z'

describe('isWallClockUnlocked', () => {
  it('null defer → 已解锁；未来 defer → 未解锁；过去 defer → 已解锁', () => {
    expect(isWallClockUnlocked(null, NOW)).toBe(true)
    expect(isWallClockUnlocked(TOMORROW, NOW)).toBe(false)
    expect(isWallClockUnlocked(YESTERDAY, NOW)).toBe(true)
    expect(isWallClockUnlocked(NOW.toISOString(), NOW)).toBe(true)
  })
})

describe('timeSlice geometry', () => {
  const slice = {
    start: '2026-07-16T00:00:00.000Z',
    end: '2026-07-17T00:00:00.000Z',
  }

  it('inTimeSlice：半开窗；open end', () => {
    expect(inTimeSlice(new Date('2026-07-16T12:00:00.000Z').getTime(), slice)).toBe(true)
    expect(inTimeSlice(new Date('2026-07-17T00:00:00.000Z').getTime(), slice)).toBe(false)
    expect(inTimeSlice(
      new Date('2099-01-01T00:00:00.000Z').getTime(),
      { start: slice.start, end: null },
    )).toBe(true)
  })

  it('relativeToSlice：before / in / after', () => {
    expect(relativeToSlice(new Date(YESTERDAY).getTime(), slice)).toBe('before')
    expect(relativeToSlice(new Date('2026-07-16T12:00:00.000Z').getTime(), slice)).toBe('in')
    expect(relativeToSlice(new Date(TOMORROW).getTime(), slice)).toBe('after')
  })

  it('relativeDayToSlice：按时区日历日归块（对齐 OF）', () => {
    // 瞬时已是 7/16 UTC，但 LA 仍是 7/15 → 相对 UTC 窗 [7/16,7/17) 为 before
    const laMs = new Date('2026-07-16T02:00:00.000Z').getTime() // LA Jul 15 evening
    expect(relativeDayToSlice(laMs, slice, 'America/Los_Angeles')).toBe('before')
    expect(relativeDayToSlice(laMs, slice, 'UTC')).toBe('in')
  })

  it('formatZonedYmd：上海日始不落成 UTC 前一日', () => {
    const shanghaiMidnight = new Date('2026-07-22T16:00:00.000Z')
    expect(formatZonedYmd(shanghaiMidnight, 'Asia/Shanghai')).toBe('2026-07-23')
    expect(formatZonedYmd(shanghaiMidnight, 'UTC')).toBe('2026-07-22')
  })

  it('formatZonedYmdHm：到分钟且按时区', () => {
    const instant = new Date('2026-08-08T15:59:00.000Z')
    expect(formatZonedYmdHm(instant, 'Asia/Shanghai')).toBe('2026-08-08 23:59')
    expect(formatZonedYmdHm(instant, 'UTC')).toBe('2026-08-08 15:59')
  })

  it('startOfZonedYmd round-trip', () => {
    const start = startOfZonedYmd('2026-07-23', 'Asia/Shanghai')
    expect(formatZonedYmd(start, 'Asia/Shanghai')).toBe('2026-07-23')
  })
})
