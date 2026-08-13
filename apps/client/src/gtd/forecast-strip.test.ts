import { FORECAST_STRIP, FORECAST_STRIP_ORDER } from '@agent/gtd'
import { describe, expect, it } from 'vitest'
import {
  forecastStripSegmentState,
  isContiguousStripSelection,
  selectedStripBounds,
  toggleForecastStrip,
} from './forecast-strip'

describe('forecast strip UI', () => {
  it('默认仅现在是连续的；三段全选连续；跳段不连续', () => {
    expect(isContiguousStripSelection([FORECAST_STRIP.NOW])).toBe(true)
    expect(isContiguousStripSelection([FORECAST_STRIP.PAST, FORECAST_STRIP.LATER])).toBe(false)
    expect(isContiguousStripSelection([
      FORECAST_STRIP.PAST,
      FORECAST_STRIP.NOW,
      FORECAST_STRIP.LATER,
    ])).toBe(true)
  })

  it('toggle 扩展为连续段（现在→以后）', () => {
    expect(toggleForecastStrip([FORECAST_STRIP.NOW], FORECAST_STRIP.LATER))
      .toEqual([
        FORECAST_STRIP.NOW,
        FORECAST_STRIP.LATER,
      ])
  })

  it('点选中间段：只保留现在，关掉过去和以后', () => {
    expect(toggleForecastStrip(
      [FORECAST_STRIP.PAST, FORECAST_STRIP.NOW, FORECAST_STRIP.LATER],
      FORECAST_STRIP.NOW,
    )).toEqual([FORECAST_STRIP.NOW])
  })

  it('独段再点：过去→过去+现在；以后→现在+以后；现在→三段全开', () => {
    expect(toggleForecastStrip([FORECAST_STRIP.PAST], FORECAST_STRIP.PAST))
      .toEqual([FORECAST_STRIP.PAST, FORECAST_STRIP.NOW])
    expect(toggleForecastStrip([FORECAST_STRIP.LATER], FORECAST_STRIP.LATER))
      .toEqual([FORECAST_STRIP.NOW, FORECAST_STRIP.LATER])
    expect(toggleForecastStrip([FORECAST_STRIP.NOW], FORECAST_STRIP.NOW))
      .toEqual([
        FORECAST_STRIP.PAST,
        FORECAST_STRIP.NOW,
        FORECAST_STRIP.LATER,
      ])
  })
})

describe('forecastStripSegmentState', () => {
  it('独段：自身 active，两侧 inactive', () => {
    expect(forecastStripSegmentState(0, 1, 1)).toBe('inactive')
    expect(forecastStripSegmentState(1, 1, 1)).toBe('active')
    expect(forecastStripSegmentState(2, 1, 1)).toBe('inactive')
  })

  it('三段全选：全部 active', () => {
    expect(forecastStripSegmentState(0, 0, 2)).toBe('active')
    expect(forecastStripSegmentState(1, 0, 2)).toBe('active')
    expect(forecastStripSegmentState(2, 0, 2)).toBe('active')
  })

  it('现在+以后：两端 active，过去 inactive', () => {
    expect(forecastStripSegmentState(0, 1, 2)).toBe('inactive')
    expect(forecastStripSegmentState(1, 1, 2)).toBe('active')
    expect(forecastStripSegmentState(2, 1, 2)).toBe('active')
  })
})

describe('selectedStripBounds', () => {
  it('空选 → null', () => {
    expect(selectedStripBounds([], FORECAST_STRIP_ORDER)).toBeNull()
  })

  it('连续选区边界', () => {
    expect(selectedStripBounds(
      [FORECAST_STRIP.NOW, FORECAST_STRIP.LATER],
      FORECAST_STRIP_ORDER,
    )).toEqual({ lo: 1, hi: 2 })
  })
})
