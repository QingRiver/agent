import { describe, expect, it } from 'vitest'
import { stripToForecastOptions, stripToTimeSlice } from '.'
import { FORECAST_STRIP } from '../../data/types'
import { DEFAULT_FORECAST_SIGNALS, NOW, opts, TZ } from '../../fixtures'
import { addZonedDays, startOfZonedToday } from '../../time/calendar'

describe('forecast strip → timeslice', () => {
  it('stripToTimeSlice：以后 end=null，从明天起', () => {
    const { range, includePast } = stripToTimeSlice([FORECAST_STRIP.LATER], NOW, TZ)
    expect(includePast).toBe(false)
    expect(range.end).toBeNull()
    const today = startOfZonedToday(NOW, TZ)
    expect(range.start).toBe(addZonedDays(today, TZ, 1).toISOString())
  })

  it('stripToForecastOptions range 对齐时区现在（今日）', () => {
    const o = stripToForecastOptions([FORECAST_STRIP.NOW], DEFAULT_FORECAST_SIGNALS, NOW, 'Asia/Shanghai')
    const today = startOfZonedToday(NOW, 'Asia/Shanghai')
    expect(o.range.start).toBe(today.toISOString())
    expect(o.range.end).toBe(addZonedDays(today, 'Asia/Shanghai', 1).toISOString())
  })

  it('opts 助手与 strip 一致', () => {
    expect(opts([FORECAST_STRIP.NOW]).includePast).toBe(false)
  })
})
