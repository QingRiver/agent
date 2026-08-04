import { describe, expect, it } from 'vitest'
import { stripToForecastOptions, stripToTimeSlice } from '.'
import { addZonedDays, startOfZonedToday } from '../time'
import { FORECAST_STRIP } from '../types'
import { DEFAULT_FORECAST_SIGNALS, NOW, opts, TZ } from './test-fixtures'

describe('forecast strip → timeslice', () => {
  it('stripToTimeSlice：以后 end=null', () => {
    const { range, includePast } = stripToTimeSlice([FORECAST_STRIP.LATER], NOW, TZ)
    expect(includePast).toBe(false)
    expect(range.end).toBeNull()
    const today = startOfZonedToday(NOW, TZ)
    expect(range.start).toBe(addZonedDays(today, TZ, 3).toISOString())
  })

  it('stripToForecastOptions range 对齐时区今日', () => {
    const o = stripToForecastOptions([FORECAST_STRIP.TODAY], DEFAULT_FORECAST_SIGNALS, NOW, 'Asia/Shanghai')
    const today = startOfZonedToday(NOW, 'Asia/Shanghai')
    expect(o.range.start).toBe(today.toISOString())
    expect(o.range.end).toBe(addZonedDays(today, 'Asia/Shanghai', 1).toISOString())
  })

  it('opts 助手与 strip 一致', () => {
    expect(opts([FORECAST_STRIP.TODAY]).includePast).toBe(false)
  })
})
