/**
 * 透视渲染管线（通用路径）：
 * 1. 可用性 base filter（View Options）
 * 2. Perspective.filter
 * 3. expandAncestors + 纯结构祖先塌陷
 * 4. flattenInTreeOrder（父先子后；sortBy 仅兄弟间）
 * 5. groupBy
 *
 * Forecast 在 step1 后早退到 renderForecast。下文按管线顺序排列，入口 {@link renderPerspective} 置顶。
 */
import type { RowStore } from '../data/rows'
import type {
  ComputedStatus,
  GroupKey,
  Perspective,
  SortKey,
} from '../data/schema'
import type { EntityRowOf } from '../data/sync-schema'
import type { AvailabilityFilter, BuiltinPerspectiveId } from '../data/types'
import type { ForecastOptions } from '../derived/forecast'
import type { TaskNode, TaskTree } from '../structure/tree'
import type { CatalogProjection } from './catalog'
import type { FilterEvalContext, FilterNode } from './filter'
import {
  AVAILABILITY_FILTER,
  BUILTIN_PERSPECTIVE_ID,
  BUILTIN_PERSPECTIVE_NAME,
  COMPUTED_STATUS,
  DEFAULT_AVAILABILITY_FILTER,
  EXPLICIT_STATUS,
  GROUP_KEY,
  SORT_DIR,
  SORT_FIELD,
} from '../data/types'
import { computeStatus } from '../derived/availability'
import { defaultForecastOptions, renderForecast } from '../derived/forecast'
import { effectiveDefer, effectiveDue, effectiveStatus } from '../inheritance/effective'
import { buildTaskTree } from '../structure/tree'
import { formatZonedYmdHm } from '../time/calendar'
import { computeCollapsibleSet, effectiveVisibleChildren, visibleDepth } from './collapse'
import { FILTER_FIELD, LEAF_OP, LOGIC_OP, matchFilter, rawValue } from './filter'

// ─── 类型 ───────────────────────────────────────────────────────────────────

/** 渲染叶子项 */
export interface RenderItem {
  taskId: string
  computed: ComputedStatus
  depth: number
}

/** 渲染分组（可嵌套） */
export interface RenderGroup {
  key: string
  label: string
  children: Array<RenderGroup | RenderItem>
}

export interface RenderContext extends CatalogProjection {
  rowStore: RowStore
  tree: TaskTree
  now: Date
  dueSoonIntervalMs: number
  statusCache: Map<string, ComputedStatus>
  /** 分组日期标签用；缺省 UTC */
  timeZone?: string
  /** 塌陷节点集（纯结构祖先）；forecast 路径传空集（不塌陷）[SP-COLLAPSE] */
  collapsibleSet: Set<string>
}

export interface RenderPerspectiveOptions extends CatalogProjection {
  availabilityFilter?: AvailabilityFilter
  forecastOptions?: ForecastOptions
}

function catalogFromOptions(options?: RenderPerspectiveOptions): CatalogProjection {
  const catalog: CatalogProjection = {}
  if (options?.projectOf)
    catalog.projectOf = options.projectOf
  if (options?.dirNameOf)
    catalog.dirNameOf = options.dirNameOf
  if (options?.tagNameOf)
    catalog.tagNameOf = options.tagNameOf
  return catalog
}

// ─── 入口 ───────────────────────────────────────────────────────────────────

/** 透视渲染总入口（管线见文件头）。 */
export function renderPerspective(
  rowStore: RowStore,
  perspective: Perspective,
  now: Date,
  dueSoonIntervalMs: number,
  timeZone: string,
  options?: RenderPerspectiveOptions,
): RenderGroup[] {
  const availabilityFilter = options?.availabilityFilter ?? DEFAULT_AVAILABILITY_FILTER
  const forecastOptions = options?.forecastOptions
  const catalog = catalogFromOptions(options)

  const tasks = rowStore.liveTasks()
  const tree = buildTaskTree(tasks)
  // ctx 先建（applyBaseFilter 需 ctx）；forecast 传空 collapsibleSet 不塌陷 [SP-COLLAPSE-FORECAST-NOOP]，通用路径 filter 后重算
  const ctx: RenderContext = {
    rowStore,
    tree,
    now,
    dueSoonIntervalMs,
    statusCache: new Map(),
    timeZone,
    collapsibleSet: new Set(),
    ...catalog,
  }
  let filtered = applyBaseFilter(tasks, availabilityFilter, ctx)

  if (perspective.id === BUILTIN_PERSPECTIVE_ID.FORECAST) {
    const opts = forecastOptions ?? defaultForecastOptions(now, timeZone)
    return renderForecast(rowStore, opts, now, dueSoonIntervalMs, filtered, timeZone)
  }

  const evalCtx: FilterEvalContext = { rowStore, tree, ...catalog }
  filtered = filtered.filter(t => matchFilter(t, perspective.filter, evalCtx))

  const matchedIds = new Set(filtered.map(t => t.id))
  // 只补祖先（树形挂载）；子孙靠自身过滤命中（TAG 为物理 task_tag），不再 expandDescendants 冲掉 Available
  const expandedIds = new Set(expandAncestors([...matchedIds], tree))
  // 纯结构祖先（非 matched 且子树含 matched 后代）塌陷：不占行，孙透传挂最近可见祖先 [SP-COLLAPSE-1]
  const collapsibleSet = computeCollapsibleSet(tree, matchedIds, expandedIds)
  ctx.collapsibleSet = collapsibleSet
  const visible = tasks.filter(t => expandedIds.has(t.id) && !collapsibleSet.has(t.id))
  const result = flattenInTreeOrder(tree, visible, perspective.sortBy, rowStore, collapsibleSet, catalog)

  return groupBy(result, perspective.groupBy, ctx)
}

// ─── 1. 可用性 base filter ──────────────────────────────────────────────────

/** 计算状态匹配可用性过滤谓词（status 走有效状态——删父/搁置父的子有效跟随，不再留在 Remaining） */
export function matchesAvailability(
  task: EntityRowOf<'task'>,
  filter: AvailabilityFilter,
  computed: ComputedStatus,
  tree: TaskTree,
): boolean {
  switch (filter) {
    case AVAILABILITY_FILTER.ALL:
      return true
    case AVAILABILITY_FILTER.REMAINING:
      return effectiveStatus(task, tree) === EXPLICIT_STATUS.ACTIVE
    case AVAILABILITY_FILTER.AVAILABLE:
      return effectiveStatus(task, tree) === EXPLICIT_STATUS.ACTIVE && computed !== COMPUTED_STATUS.BLOCKED
    default:
      return false
  }
}

function taskComputed(task: EntityRowOf<'task'>, ctx: RenderContext): ComputedStatus {
  return computeStatus(
    task,
    ctx.now,
    ctx.tree,
    ctx.dueSoonIntervalMs,
    ctx.statusCache,
  )
}

/** 可用性谓词（View Options；不进 Perspective 持久化） */
export function applyBaseFilter(
  tasks: EntityRowOf<'task'>[],
  filter: AvailabilityFilter,
  ctx: RenderContext,
): EntityRowOf<'task'>[] {
  return tasks.filter((t) => {
    const computed = taskComputed(t, ctx)
    return matchesAvailability(t, filter, computed, ctx.tree)
  })
}

// ─── 2. 展开（祖先 / 子孙）─────────────────────────────────────────────────

/** 过滤命中子任务时补齐祖先，便于树序渲染 */
export function expandAncestors(taskIds: string[], tree: TaskTree): string[] {
  const result = new Set<string>(taskIds)
  for (const id of taskIds) {
    let node = tree.byId.get(id)?.parent ?? null
    while (node) {
      result.add(node.task.id)
      node = node.parent
    }
  }
  return [...result]
}

/**
 * 过滤命中父任务时带上子孙（避免「点标签只剩空壳父节点」）。
 * 通用管线已不用（会冲掉 Available）；导出供测试 / 特殊路径。
 */
export function expandDescendants(taskIds: string[], tree: TaskTree): string[] {
  const result = new Set<string>(taskIds)
  const visit = (node: TaskNode) => {
    for (const child of node.children) {
      result.add(child.task.id)
      visit(child)
    }
  }
  for (const id of taskIds) {
    const node = tree.byId.get(id)
    if (node)
      visit(node)
  }
  return [...result]
}

// ─── 3. 树序与排序 ──────────────────────────────────────────────────────────

/** ISO 时间戳比较（null 排末尾，ASC 语义；DESC 由调用方取反）。 */
function compareIso(a: string | null, b: string | null): number {
  if (a == null && b == null)
    return 0
  if (a == null)
    return 1
  if (b == null)
    return -1
  return new Date(a).getTime() - new Date(b).getTime()
}

function compareField(
  a: EntityRowOf<'task'>,
  b: EntityRowOf<'task'>,
  field: string,
  ctx: FilterEvalContext,
): number {
  const tree = ctx.tree
  // DUE/DEFER 切 effective（天花板/地板派生，父子继承）；其余字段用 raw 物理值
  if (tree && (field === FILTER_FIELD.DUE_DATE || field === SORT_FIELD.DUE_DATE)) {
    return compareIso(effectiveDue(a, tree), effectiveDue(b, tree))
  }
  if (tree && (field === FILTER_FIELD.DEFER_DATE || field === SORT_FIELD.DEFER_DATE)) {
    return compareIso(effectiveDefer(a, tree), effectiveDefer(b, tree))
  }
  // ORDER 用 raw 物理值，但 rawValue 不识别 'order'（返回 null 会短路成 0）→ 须在 rawValue 前处理
  if (field === SORT_FIELD.ORDER) {
    return a.data.order - b.data.order
  }
  const va = rawValue(a, field, ctx)
  const vb = rawValue(b, field, ctx)
  if (va == null && vb == null) {
    return 0
  }
  if (va == null) {
    return 1
  }
  if (vb == null) {
    return -1
  }
  if (field === SORT_FIELD.ADDED_AT) {
    return new Date(a.data.createdAt).getTime() - new Date(b.data.createdAt).getTime()
  }
  if (field === FILTER_FIELD.FLAGGED || field === SORT_FIELD.FLAGGED) {
    return (va as boolean ? 1 : 0) - (vb as boolean ? 1 : 0)
  }
  if (field === FILTER_FIELD.ESTIMATE || field === SORT_FIELD.ESTIMATE) {
    return (va as number) - (vb as number)
  }
  if (field === SORT_FIELD.NAME) {
    return String(a.data.name).localeCompare(String(b.data.name))
  }
  return 0
}

/** 扁平排序（仅同级语义时正确。渲染管线请用 {@link flattenInTreeOrder}） */
export function sortTasks(
  tasks: EntityRowOf<'task'>[],
  sortBy: SortKey[],
  rowStore: RowStore,
  tree: TaskTree,
  catalog?: CatalogProjection,
): EntityRowOf<'task'>[] {
  const evalCtx: FilterEvalContext = { rowStore, tree, ...catalog }
  const sorted = [...tasks]
  sorted.sort((a, b) => {
    for (const key of sortBy) {
      const cmp = compareField(a, b, key.field, evalCtx)
      if (cmp !== 0) {
        return key.dir === SORT_DIR.ASC ? cmp : -cmp
      }
    }
    return 0
  })
  return sorted
}

function subtreeHasVisible(node: TaskNode, visibleIds: Set<string>): boolean {
  if (visibleIds.has(node.task.id))
    return true
  return node.children.some(c => subtreeHasVisible(c, visibleIds))
}

/**
 * 树序展开可见任务：父永远在子前；`sortBy` 只在兄弟间生效（order 等同级字段）。
 *
 * 修复扁平 `sortTasks(order)` 把「子 order=0」排到「父 order=1」前面的问题。
 *
 * 塌陷 pass [SP-COLLAPSE-3]：`collapsibleSet` 中的纯结构祖先不占行，其有效子（经
 * `effectiveVisibleChildren` 上浮、跳过连续塌陷层、剪除无可见后代旁枝）与本层真实非塌陷子
 * 同组 `sortBy` 排序。递归仍走真实 `node.children`——提升只决定节点在哪层输出，不改子树结构。
 * `collapsibleSet` 默认空集：无塌陷，行为与历史一致（直调测试向后兼容）。
 */
export function flattenInTreeOrder(
  tree: TaskTree,
  visible: EntityRowOf<'task'>[],
  sortBy: SortKey[],
  rowStore: RowStore,
  collapsibleSet: Set<string> = new Set(),
  catalog?: CatalogProjection,
): EntityRowOf<'task'>[] {
  const visibleIds = new Set(visible.map(t => t.id))
  const out: EntityRowOf<'task'>[] = []
  const siblingSort = sortBy.length > 0
    ? sortBy
    : [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC } satisfies SortKey]

  const visit = (siblings: TaskNode[]) => {
    const relevant = siblings.filter(n => subtreeHasVisible(n, visibleIds))
    if (!relevant.length)
      return
    // 同级排序提升：塌陷节点的有效子上浮到本层，与非塌陷兄弟同组 sortBy [SP-COLLAPSE-3]
    const effective: TaskNode[] = []
    for (const node of relevant) {
      if (collapsibleSet.has(node.task.id))
        effective.push(...effectiveVisibleChildren(node, visibleIds, collapsibleSet))
      else
        effective.push(node)
    }
    const ordered = sortTasks(effective.map(n => n.task), siblingSort, rowStore, tree, catalog)
    for (const task of ordered) {
      const node = effective.find(n => n.task.id === task.id)
      if (!node)
        continue
      if (visibleIds.has(task.id))
        out.push(task)
      visit(node.children)
    }
  }

  visit(tree.roots)
  return out
}

// ─── 4. 分组 ────────────────────────────────────────────────────────────────

/** 单 task 在某 groupKey 下的归属值列表（tag 多归属 → 多值） */
function groupValues(
  task: EntityRowOf<'task'>,
  key: GroupKey,
  ctx: RenderContext,
): string[] {
  switch (key) {
    case GROUP_KEY.PROJECT: return [ctx.projectOf?.(task) ?? '']
    case GROUP_KEY.TAG: {
      const tagIds = ctx.rowStore.tagIdsOf(task.id)
      return tagIds.length ? tagIds : ['']
    }
    case GROUP_KEY.DEFER_DATE: return [effectiveDefer(task, ctx.tree) ?? '']
    case GROUP_KEY.DUE_DATE: return [effectiveDue(task, ctx.tree) ?? '']
    case GROUP_KEY.FLAGGED: return [String(task.data.flagged)]
    case GROUP_KEY.STATUS: return [effectiveStatus(task, ctx.tree)]
    case GROUP_KEY.NONE: return ['']
    default: return ['']
  }
}

function groupLabel(key: string, groupKey: GroupKey, ctx: RenderContext): string {
  if (groupKey === GROUP_KEY.TAG) {
    if (!key)
      return '无标签'
    return ctx.tagNameOf?.(key) ?? key
  }
  if (groupKey === GROUP_KEY.PROJECT) {
    if (!key)
      return '无项目'
    return ctx.dirNameOf?.(key) ?? key
  }
  if (groupKey === GROUP_KEY.DUE_DATE || groupKey === GROUP_KEY.DEFER_DATE) {
    if (!key)
      return groupKey === GROUP_KEY.DUE_DATE ? '无截止日' : '无推迟日'
    const ms = Date.parse(key)
    if (Number.isNaN(ms))
      return key
    return formatZonedYmdHm(new Date(ms), ctx.timeZone ?? 'UTC')
  }
  return key
}

function toRenderItem(task: EntityRowOf<'task'>, ctx: RenderContext): RenderItem {
  return {
    taskId: task.id,
    computed: taskComputed(task, ctx),
    // 塌陷后可见深度（跳过纯结构祖先）；空集时等价真实树深 [SP-COLLAPSE-2]
    depth: visibleDepth(ctx.tree, task.id, ctx.collapsibleSet),
  }
}

/** 按 groupBy 键分桶（可多层） */
export function groupBy(
  tasks: EntityRowOf<'task'>[],
  keys: GroupKey[],
  ctx: RenderContext,
): RenderGroup[] {
  if (keys.length === 0) {
    return [{ key: '', label: '', children: tasks.map(t => toRenderItem(t, ctx)) }]
  }
  const first = keys[0]!
  const rest = keys.slice(1)
  const buckets = new Map<string, EntityRowOf<'task'>[]>()
  for (const t of tasks) {
    for (const gv of groupValues(t, first, ctx)) {
      const arr = buckets.get(gv) ?? []
      arr.push(t)
      buckets.set(gv, arr)
    }
  }
  return [...buckets.entries()].map(([key, ts]) => ({
    key,
    label: groupLabel(key, first, ctx),
    children: rest.length ? groupBy(ts, rest, ctx) : ts.map(t => toRenderItem(t, ctx)),
  }))
}

// ─── 内置透视 ───────────────────────────────────────────────────────────────

/** 收件箱语义：filter 为 project empty（与内置 inbox / 用户模板副本一致） */
export function isInboxFilter(filter: FilterNode | null): boolean {
  return filter != null
    && filter.op === LEAF_OP.EMPTY
    && filter.field === FILTER_FIELD.PROJECT
}

function builtin(
  id: BuiltinPerspectiveId,
  overrides: Partial<Omit<Perspective, 'id' | 'name'>> = {},
): Perspective {
  return {
    id,
    name: BUILTIN_PERSPECTIVE_NAME[id],
    icon: null,
    filter: null,
    groupBy: [],
    sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
    createdAt: new Date(0).toISOString(),
    updatedAt: null,
    ...overrides,
  }
}

/** 9 个内置透视（forecast 居首；hold/trash/all 供推荐视图与保留 id） */
export function builtinPerspectives(): Perspective[] {
  return [
    // Forecast：groupBy/sortBy 必须为空——日块分块与块内序由 renderForecast，勿假装走通用管线。
    builtin(BUILTIN_PERSPECTIVE_ID.FORECAST, {
      groupBy: [],
      sortBy: [],
    }),
    builtin(BUILTIN_PERSPECTIVE_ID.INBOX, {
      filter: { op: LEAF_OP.EMPTY, field: FILTER_FIELD.PROJECT },
      sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
    }),
    builtin(BUILTIN_PERSPECTIVE_ID.PROJECTS, {
      // 与 tags 对称：排除无项目（收件箱），再按项目分组
      filter: { op: LOGIC_OP.NOT, child: { op: LEAF_OP.EMPTY, field: FILTER_FIELD.PROJECT } },
      groupBy: [GROUP_KEY.PROJECT],
      sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
    }),
    builtin(BUILTIN_PERSPECTIVE_ID.TAGS, {
      filter: { op: LOGIC_OP.NOT, child: { op: LEAF_OP.EMPTY, field: FILTER_FIELD.TAG } },
      groupBy: [GROUP_KEY.TAG],
      sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
    }),
    builtin(BUILTIN_PERSPECTIVE_ID.FLAGGED, {
      filter: { op: LEAF_OP.IS, field: FILTER_FIELD.FLAGGED, value: true },
      sortBy: [
        { field: SORT_FIELD.DUE_DATE, dir: SORT_DIR.ASC },
        { field: SORT_FIELD.FLAGGED, dir: SORT_DIR.DESC },
      ],
    }),
    builtin(BUILTIN_PERSPECTIVE_ID.COMPLETED, {
      filter: { op: LEAF_OP.IS, field: FILTER_FIELD.STATUS, value: EXPLICIT_STATUS.COMPLETED },
      groupBy: [GROUP_KEY.DUE_DATE],
      sortBy: [{ field: SORT_FIELD.ADDED_AT, dir: SORT_DIR.DESC }],
    }),
    builtin(BUILTIN_PERSPECTIVE_ID.HOLD, {
      filter: { op: LEAF_OP.IS, field: FILTER_FIELD.STATUS, value: EXPLICIT_STATUS.HOLD },
      sortBy: [{ field: SORT_FIELD.ADDED_AT, dir: SORT_DIR.DESC }],
    }),
    // 回收站：status=deleted；须配合 availabilityFilter=all（否则 remaining 滤掉）
    builtin(BUILTIN_PERSPECTIVE_ID.TRASH, {
      filter: { op: LEAF_OP.IS, field: FILTER_FIELD.STATUS, value: EXPLICIT_STATUS.DELETED },
      sortBy: [{ field: SORT_FIELD.ADDED_AT, dir: SORT_DIR.DESC }],
    }),
    // 无 DSL 过滤；含完成/搁置需 View Options 可用性切到 all（与 completed 相同）
    builtin(BUILTIN_PERSPECTIVE_ID.ALL, {
      filter: null,
      sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
    }),
  ]
}
