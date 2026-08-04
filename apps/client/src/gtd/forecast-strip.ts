/**
 * Forecast 五段条连续多选（UI）；领域只认 stripToTimeSlice。
 */
import type { ForecastStripKey } from '@agent/gtd'
import { FORECAST_STRIP_ORDER } from '@agent/gtd'

/** 选中预设须为 `FORECAST_STRIP_ORDER` 上的连续下标区间 */
export function isContiguousStripSelection(selected: readonly ForecastStripKey[]): boolean {
  if (selected.length === 0)
    return false
  const idxs = selected
    .map(k => FORECAST_STRIP_ORDER.indexOf(k as typeof FORECAST_STRIP_ORDER[number]))
    .filter(i => i >= 0)
    .sort((a, b) => a - b)
  if (idxs.length !== selected.length || idxs.length === 0)
    return false
  for (let i = 1; i < idxs.length; i++) {
    if (idxs[i]! !== idxs[i - 1]! + 1)
      return false
  }
  return true
}

/**
 * 点击五段：扩成覆盖新点与原选区的连续段；再点已选端点则收缩。
 */
export function toggleForecastStrip(
  current: readonly ForecastStripKey[],
  clicked: ForecastStripKey,
): ForecastStripKey[] {
  const order = FORECAST_STRIP_ORDER
  const clickIdx = order.indexOf(clicked as typeof order[number])
  if (clickIdx < 0)
    return [...current]

  const curIdx = current
    .map(k => order.indexOf(k as typeof order[number]))
    .filter(i => i >= 0)
    .sort((a, b) => a - b)

  if (curIdx.length === 0)
    return [clicked]

  const lo = curIdx[0]!
  const hi = curIdx[curIdx.length - 1]!

  if (clickIdx === lo && clickIdx === hi)
    return [clicked]
  if (clickIdx === lo && hi > lo)
    return order.slice(lo + 1, hi + 1) as ForecastStripKey[]
  if (clickIdx === hi && hi > lo)
    return order.slice(lo, hi) as ForecastStripKey[]
  if (clickIdx > lo && clickIdx < hi)
    return order.slice(lo, hi + 1) as ForecastStripKey[]

  const nLo = Math.min(lo, clickIdx)
  const nHi = Math.max(hi, clickIdx)
  return order.slice(nLo, nHi + 1) as ForecastStripKey[]
}
