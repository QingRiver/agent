import { FORECAST_STRIP } from '@agent/gtd'
import { describe, expect, it } from 'vitest'
import { isContiguousStripSelection, toggleForecastStrip } from './forecast-strip'

describe('forecast strip UI', () => {
  it('默认仅今日是连续的；含以后五段连续', () => {
    expect(isContiguousStripSelection([FORECAST_STRIP.TODAY])).toBe(true)
    expect(isContiguousStripSelection([FORECAST_STRIP.PAST, FORECAST_STRIP.DAY_AFTER])).toBe(false)
    expect(isContiguousStripSelection([
      FORECAST_STRIP.TODAY,
      FORECAST_STRIP.TOMORROW,
      FORECAST_STRIP.DAY_AFTER,
      FORECAST_STRIP.LATER,
    ])).toBe(true)
  })

  it('toggle 扩展为连续段（含以后）', () => {
    expect(toggleForecastStrip([FORECAST_STRIP.TODAY], FORECAST_STRIP.LATER))
      .toEqual([
        FORECAST_STRIP.TODAY,
        FORECAST_STRIP.TOMORROW,
        FORECAST_STRIP.DAY_AFTER,
        FORECAST_STRIP.LATER,
      ])
  })
})
