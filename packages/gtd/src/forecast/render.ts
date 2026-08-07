/**
 * Forecast 渲染：按 timeslice 吸顶分块 + 块内序（wiki §1.1.1）。
 * `computeStatus` / depth 用全量 liveTasks 树；`tasks` 仅作归桶列表（已 applyBaseFilter）。
 */
import type { RenderContext, RenderGroup, RenderItem } from '../perspective'
import type { RowStore } from '../rows'
import type { EntityRowOf } from '../sync-schema'
import type { ForecastBlockKey, ForecastOptions } from './types'
import { computeStatus } from '../availability'
import {
  formatZonedYmd,
  inTimeSlice,
  startOfZonedDay,
  startOfZonedToday,
  startOfZonedYmd,
} from '../time'
import { buildTaskTree, taskDepth } from '../tree'
import {
  COMPUTED_STATUS,
  FORECAST_STRIP,
  FORECAST_STRIP_TEXT,
  PLANNED_MODE,
} from '../types'
import { assignForecastBlock } from './assign'
import { dayBlockKey } from './block-key'
import { dayStartAtOffset, NAMED_DAY_OFFSETS } from './strip-offsets'

/** 有限窗按日预建桶；开窗仅预建落在窗内的今日/明天/后天，更远日由任务动态建桶 */
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
  if (key === FORECAST_STRIP.TODAY)
    return FORECAST_STRIP_TEXT[FORECAST_STRIP.TODAY]
  if (key === FORECAST_STRIP.TOMORROW)
    return FORECAST_STRIP_TEXT[FORECAST_STRIP.TOMORROW]
  if (key === FORECAST_STRIP.DAY_AFTER)
    return FORECAST_STRIP_TEXT[FORECAST_STRIP.DAY_AFTER]
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

function computedRank(status: string): number {
  if (status === COMPUTED_STATUS.OVERDUE)
    return 0
  if (status === COMPUTED_STATUS.DUE_SOON)
    return 1
  return 2
}

/** 块内序：computed → due → defer → planned → order → id（wiki §1.1.1） */
function sortBlockTasks(
  tasks: EntityRowOf<'task'>[],
  ctx: RenderContext,
): EntityRowOf<'task'>[] {
  const statusOf = (t: EntityRowOf<'task'>) => computeStatus(
    t,
    ctx.now,
    ctx.tree,
    ctx.dueSoonIntervalMs,
    ctx.statusCache,
  )
  const sorted = [...tasks]
  sorted.sort((a, b) => {
    const ra = computedRank(statusOf(a))
    const rb = computedRank(statusOf(b))
    if (ra !== rb)
      return ra - rb

    const dueA = a.data.dueDate ? new Date(a.data.dueDate).getTime() : Number.POSITIVE_INFINITY
    const dueB = b.data.dueDate ? new Date(b.data.dueDate).getTime() : Number.POSITIVE_INFINITY
    if (dueA !== dueB)
      return dueA - dueB

    const deferA = a.data.deferDate ? new Date(a.data.deferDate).getTime() : Number.POSITIVE_INFINITY
    const deferB = b.data.deferDate ? new Date(b.data.deferDate).getTime() : Number.POSITIVE_INFINITY
    if (deferA !== deferB)
      return deferA - deferB

    const planA = a.data.plannedMode === PLANNED_MODE.ON && a.data.plannedDate
      ? new Date(a.data.plannedDate).getTime()
      : Number.POSITIVE_INFINITY
    const planB = b.data.plannedMode === PLANNED_MODE.ON && b.data.plannedDate
      ? new Date(b.data.plannedDate).getTime()
      : Number.POSITIVE_INFINITY
    if (planA !== planB)
      return planA - planB

    if (a.data.order !== b.data.order)
      return a.data.order - b.data.order
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return sorted
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
  const ctx: RenderContext = { rowStore, tree, now, dueSoonIntervalMs, statusCache: new Map() }

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
    const block = assignForecastBlock(t, options, now, timeZone)
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
      if (!(
        key === FORECAST_STRIP.TODAY
        || key === FORECAST_STRIP.TOMORROW
        || key === FORECAST_STRIP.DAY_AFTER
      )) {
        continue
      }
    }
    const sorted = sortBlockTasks(list, ctx)
    groups.push({
      key,
      label: forecastBlockLabel(key, timeZone),
      children: sorted.map(t => toItem(t, ctx)),
    })
  }
  return groups
}
