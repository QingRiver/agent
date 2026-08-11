import type { RowStore } from '../data/rows'
import type {
  ComputedStatus,
  GroupKey,
  Perspective,
  SortKey,
} from '../data/schema'
import type { EntityRowOf } from '../data/sync-schema'
import type { ForecastOptions } from '../derived/forecast'
import type { TaskNode, TaskTree } from '../structure/tree'
import type { FilterEvalContext } from './filter'
import {
  AVAILABILITY_FILTER,
  COMPUTED_STATUS,
  EXPLICIT_STATUS,
  GROUP_KEY,
  SORT_DIR,
  SORT_FIELD,
} from '../data/types'
import { computeStatus } from '../derived/availability'
import { defaultForecastOptions, renderForecast } from '../derived/forecast'
import { effectiveDefer, effectiveDue } from '../inheritance/effective'
import { buildTaskTree } from '../structure/tree'
import { formatZonedYmdHm } from '../time/calendar'
import { computeCollapsibleSet, effectiveVisibleChildren, visibleDepth } from './collapse'
import { FILTER_FIELD, LEAF_OP, LOGIC_OP, matchFilter, rawValue } from './filter'

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

export interface RenderContext {
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

function isActionable(computed: ComputedStatus): boolean {
  return computed === COMPUTED_STATUS.AVAILABLE
    || computed === COMPUTED_STATUS.DUE_SOON
    || computed === COMPUTED_STATUS.OVERDUE
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

/** Step1 基础过滤 */
export function applyBaseFilter(
  tasks: EntityRowOf<'task'>[],
  perspective: Pick<Perspective, 'availabilityFilter' | 'showCompleted' | 'showDropped' | 'flaggedOnly'>,
  ctx: RenderContext,
): EntityRowOf<'task'>[] {
  return tasks.filter((t) => {
    if (!perspective.showCompleted && t.data.status === EXPLICIT_STATUS.COMPLETED) {
      return false
    }
    if (
      !perspective.showDropped
      && (t.data.status === EXPLICIT_STATUS.HOLD || t.data.status === EXPLICIT_STATUS.DELETED)
    ) {
      return false
    }
    if (perspective.flaggedOnly === true && !t.data.flagged) {
      return false
    }

    if (perspective.availabilityFilter === AVAILABILITY_FILTER.ALL) {
      return true
    }
    if (perspective.availabilityFilter === AVAILABILITY_FILTER.REMAINING) {
      return t.data.status === EXPLICIT_STATUS.ACTIVE
    }

    const computed = taskComputed(t, ctx)
    return isActionable(computed)
  })
}

/** 内置透视额外过滤（非通用 DSL；forecast 不经此函数）。review 透视移除。 */
export function applyBuiltinFilter(
  tasks: EntityRowOf<'task'>[],
  perspective: Perspective,
): EntityRowOf<'task'>[] {
  switch (perspective.id) {
    case 'inbox':
      // Inbox = mountDirId null（位置权威），且无 parent（顶层）
      return tasks.filter(t => t.data.mountDirId === null && t.data.parentId === null)
    case 'completed':
      return tasks.filter(t => t.data.status === EXPLICIT_STATUS.COMPLETED)
    default:
      return tasks
  }
}

/** Step3 父级展开（过滤命中子任务时补齐祖先，便于树序渲染） */
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

/** 子树展开（过滤命中父任务时带上子孙，避免「点标签只剩空壳父节点」） */
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

/** 单 task 在某 groupKey 下的归属值列表（tag 多归属 → 多值） */
function groupValues(
  task: EntityRowOf<'task'>,
  key: GroupKey,
  rowStore: RowStore,
  tree: TaskTree,
): string[] {
  switch (key) {
    case GROUP_KEY.PROJECT: return [rowStore.projectOf?.(task) ?? task.data.projectId ?? '']
    case GROUP_KEY.TAG: {
      // 自身无标时继承最近带标祖先，使 expandDescendants 进来的子任务仍落在父标签组
      let tagIds = rowStore.tagIdsOf(task.id)
      if (!tagIds.length) {
        let node = tree.byId.get(task.id)?.parent ?? null
        while (node) {
          const inherited = rowStore.tagIdsOf(node.task.id)
          if (inherited.length) {
            tagIds = inherited
            break
          }
          node = node.parent
        }
      }
      return tagIds.length ? tagIds : ['']
    }
    case GROUP_KEY.DEFER_DATE: return [effectiveDefer(task, tree) ?? '']
    case GROUP_KEY.DUE_DATE: return [effectiveDue(task, tree) ?? '']
    case GROUP_KEY.FLAGGED: return [String(task.data.flagged)]
    case GROUP_KEY.STATUS: return [task.data.status]
    case GROUP_KEY.NONE: return ['']
    default: return ['']
  }
}

function groupLabel(key: string, groupKey: GroupKey, rowStore: RowStore, timeZone: string): string {
  if (groupKey === GROUP_KEY.TAG) {
    if (!key)
      return '无标签'
    return rowStore.findLive('tag', key)?.data.name ?? key
  }
  if (groupKey === GROUP_KEY.PROJECT) {
    if (!key)
      return '无项目'
    return rowStore.dirNameOf?.(key) ?? key
  }
  if (groupKey === GROUP_KEY.DUE_DATE || groupKey === GROUP_KEY.DEFER_DATE) {
    if (!key)
      return groupKey === GROUP_KEY.DUE_DATE ? '无截止日' : '无推迟日'
    const ms = Date.parse(key)
    if (Number.isNaN(ms))
      return key
    return formatZonedYmdHm(new Date(ms), timeZone)
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

/** Step4 分组 */
export function groupBy(
  tasks: EntityRowOf<'task'>[],
  keys: GroupKey[],
  rowStore: RowStore,
  ctx: RenderContext,
): RenderGroup[] {
  if (keys.length === 0) {
    return [{ key: '', label: '', children: tasks.map(t => toRenderItem(t, ctx)) }]
  }
  const first = keys[0]!
  const rest = keys.slice(1)
  const buckets = new Map<string, EntityRowOf<'task'>[]>()
  for (const t of tasks) {
    for (const gv of groupValues(t, first, rowStore, ctx.tree)) {
      const arr = buckets.get(gv) ?? []
      arr.push(t)
      buckets.set(gv, arr)
    }
  }
  return [...buckets.entries()].map(([key, ts]) => ({
    key,
    label: groupLabel(key, first, rowStore, ctx.timeZone ?? 'UTC'),
    children: rest.length ? groupBy(ts, rest, rowStore, ctx) : ts.map(t => toRenderItem(t, ctx)),
  }))
}

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
  rowStore: RowStore,
  tree: TaskTree,
): number {
  // DUE/DEFER 切 effective（天花板/地板派生，父子继承）；其余字段用 raw 物理值
  if (field === FILTER_FIELD.DUE_DATE || field === SORT_FIELD.DUE_DATE) {
    return compareIso(effectiveDue(a, tree), effectiveDue(b, tree))
  }
  if (field === FILTER_FIELD.DEFER_DATE || field === SORT_FIELD.DEFER_DATE) {
    return compareIso(effectiveDefer(a, tree), effectiveDefer(b, tree))
  }
  // ORDER 用 raw 物理值，但 rawValue 不识别 'order'（返回 null 会短路成 0）→ 须在 rawValue 前处理
  if (field === SORT_FIELD.ORDER) {
    return a.data.order - b.data.order
  }
  const va = rawValue(a, field, rowStore)
  const vb = rawValue(b, field, rowStore)
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

/** Step5 排序（扁平；仅同级语义时正确。渲染管线请用 {@link flattenInTreeOrder}） */
export function sortTasks(
  tasks: EntityRowOf<'task'>[],
  sortBy: SortKey[],
  rowStore: RowStore,
  tree: TaskTree,
): EntityRowOf<'task'>[] {
  const sorted = [...tasks]
  sorted.sort((a, b) => {
    for (const key of sortBy) {
      const cmp = compareField(a, b, key.field, rowStore, tree)
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
    const ordered = sortTasks(effective.map(n => n.task), siblingSort, rowStore, tree)
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

/**
 * 完整渲染管线。
 * forecast：先 applyBaseFilter（尊重声明的 availabilityFilter / show*），再 renderForecast 日块分块；
 * 不走 matchFilter / applyBuiltinFilter / Perspective.groupBy / sortBy（日块归属与块内序由 forecast 域负责）。
 */
export function renderPerspective(
  rowStore: RowStore,
  perspective: Perspective,
  now: Date,
  dueSoonIntervalMs: number,
  timeZone: string,
  forecastOptions?: ForecastOptions,
): RenderGroup[] {
  if (perspective.id === 'forecast') {
    const all = rowStore.liveTasks()
    const tree = buildTaskTree(all)
    // forecast 独立路径（renderForecast），不走 expand/flatten/collapse；传空集不塌陷 [SP-COLLAPSE-FORECAST-NOOP]
    const ctx: RenderContext = { rowStore, tree, now, dueSoonIntervalMs, statusCache: new Map(), timeZone, collapsibleSet: new Set() }
    const filtered = applyBaseFilter(all, perspective, ctx)
    const opts = forecastOptions ?? defaultForecastOptions(now, timeZone)
    return renderForecast(rowStore, opts, now, dueSoonIntervalMs, filtered, timeZone)
  }

  const tasks = rowStore.liveTasks()
  const tree = buildTaskTree(tasks)
  // ctx 先建（applyBaseFilter 需 ctx）；collapsibleSet 占位空集，filter 后按 matchedIds 重算覆盖
  const ctx: RenderContext = { rowStore, tree, now, dueSoonIntervalMs, statusCache: new Map(), timeZone, collapsibleSet: new Set() }
  const evalCtx: FilterEvalContext = { rowStore }

  let filtered = applyBaseFilter(tasks, perspective, ctx)
  filtered = filtered.filter(t => matchFilter(t, perspective.filter, evalCtx))
  filtered = applyBuiltinFilter(filtered, perspective)

  const matchedIds = new Set(filtered.map(t => t.id))
  const expandedIds = new Set([
    ...expandAncestors([...matchedIds], tree),
    ...expandDescendants([...matchedIds], tree),
  ])
  // 纯结构祖先（非 matched 且子树含 matched 后代）塌陷：不占行，孙透传挂最近可见祖先 [SP-COLLAPSE-1]
  const collapsibleSet = computeCollapsibleSet(tree, matchedIds, expandedIds)
  ctx.collapsibleSet = collapsibleSet
  const visible = tasks.filter(t => expandedIds.has(t.id) && !collapsibleSet.has(t.id))
  const result = flattenInTreeOrder(tree, visible, perspective.sortBy, rowStore, collapsibleSet)

  return groupBy(result, perspective.groupBy, rowStore, ctx)
}

function builtin(id: string, name: string, overrides: Partial<Perspective> = {}): Perspective {
  return {
    id,
    name,
    icon: null,
    filter: null,
    groupBy: [],
    sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
    availabilityFilter: AVAILABILITY_FILTER.AVAILABLE,
    showCompleted: false,
    showDropped: false,
    flaggedOnly: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: null,
    ...overrides,
  }
}

/** 6 个内置透视（forecast 居首；移除 review） */
export function builtinPerspectives(): Perspective[] {
  return [
    // Forecast：availabilityFilter/show* 经 applyBaseFilter 生效；
    // groupBy/sortBy 必须为空——日块分块与块内序由 renderForecast，勿假装走通用管线。
    builtin('forecast', '预测', {
      availabilityFilter: AVAILABILITY_FILTER.REMAINING,
      groupBy: [],
      sortBy: [],
    }),
    builtin('inbox', '收件箱', {
      availabilityFilter: AVAILABILITY_FILTER.REMAINING,
      filter: { op: LEAF_OP.EMPTY, field: FILTER_FIELD.PROJECT },
      sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
    }),
    builtin('projects', '项目', {
      groupBy: [GROUP_KEY.PROJECT],
      sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
    }),
    builtin('tags', '标签', {
      // 只收已打标任务；未打标不再混进「标签」透视（否则点侧栏具体标签会像「突然变空」）
      filter: { op: LOGIC_OP.NOT, child: { op: LEAF_OP.EMPTY, field: FILTER_FIELD.TAG } },
      groupBy: [GROUP_KEY.TAG],
      sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
    }),
    builtin('flagged', '旗标', {
      filter: { op: LEAF_OP.IS, field: FILTER_FIELD.FLAGGED, value: true },
      sortBy: [
        { field: SORT_FIELD.DUE_DATE, dir: SORT_DIR.ASC },
        { field: SORT_FIELD.FLAGGED, dir: SORT_DIR.DESC },
      ],
    }),
    builtin('completed', '已完成', {
      availabilityFilter: AVAILABILITY_FILTER.ALL,
      showCompleted: true,
      groupBy: [GROUP_KEY.DUE_DATE],
      sortBy: [{ field: SORT_FIELD.ADDED_AT, dir: SORT_DIR.DESC }],
    }),
  ]
}
