import type { RowStore } from '../../data/rows'
import type { EntityRowOf } from '../../data/sync-schema'
/**
 * Forecast 渲染：按 timeslice 吸顶分块 + 块内树序（保层级）。
 * `computeStatus` / depth 用全量 liveTasks 树；`tasks` 仅作归桶列表（已 applyBaseFilter）。
 */
import type { RenderContext, RenderGroup, RenderItem } from '../../view/perspective'
import type { ForecastBlockKey, ForecastOptions } from './types'
import {
  FORECAST_STRIP,
  FORECAST_STRIP_TEXT,
} from '../../data/types'
import { buildTaskTree, taskDepth } from '../../structure/tree'
import {
  formatZonedYmd,
  inTimeSlice,
  startOfZonedDay,
  startOfZonedToday,
  startOfZonedYmd,
} from '../../time/calendar'
import { flattenInTreeOrder } from '../../view/perspective'
import { computeStatus } from '../availability'
import { assignForecastBlock } from './assign'
import { dayBlockKey } from './block-key'
import { dayStartAtOffset, NAMED_DAY_OFFSETS } from './strip-offsets'

/** 有限窗按日预建桶；开窗仅预建落在窗内的「现在」，更远日由任务动态建桶 */
function enumerateDayBuckets(
  options: ForecastOptions,
  now: Date,
  timeZone: string,
): { key: ForecastBlockKey, start: Date }[] {
  const today = startOfZonedToday(now, timeZone)
  const rangeStart = new Date(options.range.start).getTime()
  const rangeEnd = options.range.end != null ? new Date(options.range.end).getTime() : null
  const days: { key: ForecastBlockKey, start: Date }[] = []

  if (rangeEnd == null) {
    for (const offset of NAMED_DAY_OFFSETS) {
      const start = dayStartAtOffset(today, timeZone, offset)
      if (inTimeSlice(start.getTime(), options.range))
        days.push({ key: dayBlockKey(start, today, timeZone), start })
    }
    return days
  }

  let cursor = startOfZonedDay(new Date(options.range.start), timeZone)
  for (let i = 0; i < 366; i++) {
    const startMs = cursor.getTime()
    if (startMs >= rangeEnd)
      break
    if (startMs >= rangeStart)
      days.push({ key: dayBlockKey(cursor, today, timeZone), start: cursor })
    cursor = dayStartAtOffset(cursor, timeZone, 1)
  }
  return days
}

function forecastBlockLabel(key: ForecastBlockKey, timeZone: string): string {
  if (key === FORECAST_STRIP.PAST)
    return FORECAST_STRIP_TEXT[FORECAST_STRIP.PAST]
  if (key === FORECAST_STRIP.NOW)
    return FORECAST_STRIP_TEXT[FORECAST_STRIP.NOW]
  if (/^\d{4}-\d{2}-\d{2}$/.test(key))
    return key
  try {
    return formatZonedYmd(new Date(key), timeZone)
  }
  catch {
    return key
  }
}

function toItem(task: EntityRowOf<'task'>, ctx: RenderContext): RenderItem {
  const computed = computeStatus(
    task,
    ctx.now,
    ctx.tree,
    ctx.dueSoonIntervalMs,
    ctx.statusCache,
  )
  return {
    taskId: task.id,
    computed,
    depth: taskDepth(ctx.tree, task.id),
  }
}

function blockSortKey(key: ForecastBlockKey, now: Date, timeZone: string): number {
  if (key === FORECAST_STRIP.PAST)
    return Number.NEGATIVE_INFINITY
  const today = startOfZonedToday(now, timeZone)
  for (const offset of NAMED_DAY_OFFSETS) {
    const start = dayStartAtOffset(today, timeZone, offset)
    const named = dayBlockKey(start, today, timeZone)
    if (key === named)
      return start.getTime()
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(key))
    return startOfZonedYmd(key, timeZone).getTime()
  return new Date(key).getTime()
}

/**
 * 渲染 Forecast：按 timeslice 吸顶分块。
 * `tasks` 须由调用方先经 applyBaseFilter（通常 REMAINING）；本函数不再自行按 status 过滤。
 * 树与 status 基于 `rowStore.liveTasks()` 全量，避免过滤子集丢祖先导致 computed 失真。
 */
export function renderForecast(
  rowStore: RowStore,
  options: ForecastOptions,
  now: Date,
  dueSoonIntervalMs: number,
  tasks: EntityRowOf<'task'>[],
  timeZone: string,
): RenderGroup[] {
  const tree = buildTaskTree(rowStore.liveTasks())
  const ctx: RenderContext = { rowStore, tree, now, dueSoonIntervalMs, statusCache: new Map(), collapsibleSet: new Set() }

  const buckets = new Map<ForecastBlockKey, EntityRowOf<'task'>[]>()
  const ensure = (k: ForecastBlockKey) => {
    if (!buckets.has(k))
      buckets.set(k, [])
  }

  if (options.includePast)
    ensure(FORECAST_STRIP.PAST)
  for (const d of enumerateDayBuckets(options, now, timeZone))
    ensure(d.key)

  for (const t of tasks) {
    const block = assignForecastBlock(t, options, now, timeZone, tree)
    if (block == null)
      continue
    ensure(block)
    buckets.get(block)!.push(t)
  }

  const keys = [...buckets.keys()].sort(
    (a, b) => blockSortKey(a, now, timeZone) - blockSortKey(b, now, timeZone),
  )

  const groups: RenderGroup[] = []
  for (const key of keys) {
    const list = buckets.get(key)!
    if (list.length === 0 && key !== FORECAST_STRIP.PAST) {
      // 空桶只保留「过去」「现在」吸顶；更远日无任务则不占行
      if (key !== FORECAST_STRIP.NOW)
        continue
    }
    const sorted = flattenInTreeOrder(tree, list, [], rowStore)
    groups.push({
      key,
      label: forecastBlockLabel(key, timeZone),
      children: sorted.map(t => toItem(t, ctx)),
    })
  }
  return groups
}
