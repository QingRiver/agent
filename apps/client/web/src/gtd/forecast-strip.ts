/**
 * Forecast 三段条：连续多选交互 + 段 UI 状态。
 * 领域只认 stripToTimeSlice；本文件仅 client UI。
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
 * 点击三段：扩成覆盖新点与原选区的连续段；再点已选端点则收缩；
 * 点选区内中间段 → 只保留该段（关掉两侧）。
 * 独段再点：过去/以后 → 扩到含现在；现在 → 三段全开。
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

  // 独段再点：端点向现在扩展；现在则全开
  if (clickIdx === lo && clickIdx === hi) {
    if (clickIdx === 0)
      return order.slice(0, 2) as ForecastStripKey[]
    if (clickIdx === order.length - 1)
      return order.slice(1) as ForecastStripKey[]
    return [...order] as ForecastStripKey[]
  }
  if (clickIdx === lo && hi > lo)
    return order.slice(lo + 1, hi + 1) as ForecastStripKey[]
  if (clickIdx === hi && hi > lo)
    return order.slice(lo, hi) as ForecastStripKey[]
  // 中间段：单独激活该段，关闭两侧
  if (clickIdx > lo && clickIdx < hi)
    return [clicked]

  const nLo = Math.min(lo, clickIdx)
  const nHi = Math.max(hi, clickIdx)
  return order.slice(nLo, nHi + 1) as ForecastStripKey[]
}

/** 段视觉状态：选区内高亮，选区外可点扩展 */
export type ForecastStripSegmentState = 'active' | 'inactive'

export function forecastStripSegmentState(
  index: number,
  lo: number,
  hi: number,
): ForecastStripSegmentState {
  if (index < lo || index > hi)
    return 'inactive'
  return 'active'
}

export function selectedStripBounds(
  selected: readonly string[],
  order: readonly string[],
): { lo: number, hi: number } | null {
  const idxs = selected
    .map(k => order.indexOf(k))
    .filter(i => i >= 0)
    .sort((a, b) => a - b)
  if (idxs.length === 0)
    return null
  return { lo: idxs[0]!, hi: idxs[idxs.length - 1]! }
}
