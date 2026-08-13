/**
 * 栏位正交 → tier 去重 → 归块（wiki §1.1.1）。
 */
import type { EntityRowOf } from '../../data/sync-schema'
import type { TaskTree } from '../../structure/tree'
import type { ForecastBlockKey, ForecastOptions, LaneHit } from './types'
import { laneDeferred, laneFlagged, laneOverdueDue, lanePlanned } from './lanes'
import { TIER_ORDER } from './types'

/**
 * tier 去重（wiki §1.1.1「tier 去重」mermaid）。
 * 高者胜：逾期 > 截止 > 推迟 > 计划 > 旗标；皆空 → null。
 */
export function pickByTier(hits: readonly (LaneHit | null)[]): LaneHit | null {
  let best: LaneHit | null = null
  let bestRank = Infinity
  for (const h of hits) {
    if (h == null)
      continue
    const rank = TIER_ORDER.indexOf(h.lane)
    if (rank >= 0 && rank < bestRank) {
      best = h
      bestRank = rank
    }
  }
  return best
}

/**
 * 单 task 归属 Forecast 块；null = 不进视图。
 * 各栏独立贡献（正交，互不整单封杀）→ `pickByTier` 取最高命中栏的 `block`。
 * `tree` 传入时 Due/Defer/Plan 走 effective 日期（wiki §时间联动）。
 */
export function assignForecastBlock(
  task: EntityRowOf<'task'>,
  options: ForecastOptions,
  now: Date,
  timeZone: string,
  tree?: TaskTree,
): ForecastBlockKey | null {
  const { overdue, due } = laneOverdueDue(task, options, now, timeZone, tree)
  const hit = pickByTier([
    overdue,
    due,
    laneDeferred(task, options, now, timeZone, tree),
    lanePlanned(task, options, now, timeZone, tree),
    laneFlagged(task, options, now, timeZone, tree),
  ])
  return hit?.block ?? null
}
