import type { FilterEvalContext } from './filter'
import type { RowStore } from './rows'
import type {
  ComputedStatus,
  GroupKey,
  Perspective,
  Project,
  SortKey,
} from './schema'
import type { EntityRowOf } from './sync-schema'
import type { TaskTree } from './tree'
import { computeStatus } from './availability'
import { FILTER_FIELD, LEAF_OP, matchFilter, rawValue } from './filter'
import { needsReview } from './review'
import { buildTaskTree } from './tree'
import {
  AVAILABILITY_FILTER,
  COMPUTED_STATUS,
  EXPLICIT_STATUS,
  GROUP_KEY,
  SORT_DIR,
  SORT_FIELD,
} from './types'

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
}

function isActionable(computed: ComputedStatus): boolean {
  return computed === COMPUTED_STATUS.AVAILABLE
    || computed === COMPUTED_STATUS.DUE_SOON
    || computed === COMPUTED_STATUS.OVERDUE
}

function taskDepth(tree: TaskTree, taskId: string): number {
  let depth = 0
  let node = tree.byId.get(taskId)?.parent ?? null
  while (node) {
    depth++
    node = node.parent
  }
  return depth
}

function taskComputed(task: EntityRowOf<'task'>, ctx: RenderContext): ComputedStatus {
  return computeStatus(
    task,
    ctx.now,
    ctx.tree,
    ctx.dueSoonIntervalMs,
    ctx.rowStore.liveProjects(),
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
      && (t.data.status === EXPLICIT_STATUS.CANCELLED || t.data.status === EXPLICIT_STATUS.DELETED)
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

/** 内置透视额外过滤 */
export function applyBuiltinFilter(
  tasks: EntityRowOf<'task'>[],
  perspective: Perspective,
  rowStore: RowStore,
  now: Date,
  dueSoonIntervalMs: number,
): EntityRowOf<'task'>[] {
  switch (perspective.id) {
    case 'inbox':
      return tasks.filter(t => t.data.projectId === null && t.data.parentId === null)
    case 'review':
      return tasks.filter((t) => {
        if (!t.data.projectId) {
          return false
        }
        const project = rowStore.findLive('project', t.data.projectId)
        return project ? needsReview(project.data as unknown as Project, now) : false
      })
    case 'completed':
      return tasks.filter(t => t.data.status === EXPLICIT_STATUS.COMPLETED)
    case 'predicted':
      return tasks.filter(t => t.data.dueDate != null)
    case 'forecast': {
      const horizon = new Date(now.getTime() + dueSoonIntervalMs * 7)
      return tasks.filter((t) => {
        if (!t.data.dueDate) {
          return false
        }
        const due = new Date(t.data.dueDate).getTime()
        return due >= now.getTime() && due <= horizon.getTime()
      })
    }
    default:
      return tasks
  }
}

/** Step3 父级展开 */
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

/** 单 task 在某 groupKey 下的归属值列表（tag 多归属 → 多值） */
function groupValues(task: EntityRowOf<'task'>, key: GroupKey, rowStore: RowStore): string[] {
  switch (key) {
    case GROUP_KEY.PROJECT: return [task.data.projectId ?? '']
    case GROUP_KEY.FOLDER: {
      const proj = rowStore.findLive('project', task.data.projectId ?? '')
      return [proj?.data.folderId ?? '']
    }
    case GROUP_KEY.TAG: {
      const tagIds = rowStore.tagIdsOf(task.id)
      return tagIds.length ? tagIds : ['']
    }
    case GROUP_KEY.DEFER_DATE: return [task.data.deferDate ?? '']
    case GROUP_KEY.DUE_DATE: return [task.data.dueDate ?? '']
    case GROUP_KEY.FLAGGED: return [String(task.data.flagged)]
    case GROUP_KEY.STATUS: return [task.data.status]
    case GROUP_KEY.NONE: return ['']
    default: return ['']
  }
}

function toRenderItem(task: EntityRowOf<'task'>, ctx: RenderContext): RenderItem {
  return {
    taskId: task.id,
    computed: taskComputed(task, ctx),
    depth: taskDepth(ctx.tree, task.id),
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
    for (const gv of groupValues(t, first, rowStore)) {
      const arr = buckets.get(gv) ?? []
      arr.push(t)
      buckets.set(gv, arr)
    }
  }
  return [...buckets.entries()].map(([key, ts]) => ({
    key,
    label: key,
    children: rest.length ? groupBy(ts, rest, rowStore, ctx) : ts.map(t => toRenderItem(t, ctx)),
  }))
}

function compareField(a: EntityRowOf<'task'>, b: EntityRowOf<'task'>, field: string, rowStore: RowStore): number {
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
  if (field === FILTER_FIELD.DUE_DATE || field === FILTER_FIELD.DEFER_DATE) {
    return new Date(va as string).getTime() - new Date(vb as string).getTime()
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
  if (field === SORT_FIELD.ORDER) {
    return a.data.order - b.data.order
  }
  return 0
}

/** Step5 排序 */
export function sortTasks(tasks: EntityRowOf<'task'>[], sortBy: SortKey[], rowStore: RowStore): EntityRowOf<'task'>[] {
  const sorted = [...tasks]
  sorted.sort((a, b) => {
    for (const key of sortBy) {
      const cmp = compareField(a, b, key.field, rowStore)
      if (cmp !== 0) {
        return key.dir === SORT_DIR.ASC ? cmp : -cmp
      }
    }
    return 0
  })
  return sorted
}

/** 完整渲染管线：6 步产出顶层 RenderGroup[] */
export function renderPerspective(
  rowStore: RowStore,
  perspective: Perspective,
  now: Date,
  dueSoonIntervalMs: number,
): RenderGroup[] {
  const tasks = rowStore.liveTasks()
  const tree = buildTaskTree(tasks)
  const ctx: RenderContext = { rowStore, tree, now, dueSoonIntervalMs, statusCache: new Map() }
  const evalCtx: FilterEvalContext = { rowStore }

  let filtered = applyBaseFilter(tasks, perspective, ctx)
  filtered = filtered.filter(t => matchFilter(t, perspective.filter, evalCtx))
  filtered = applyBuiltinFilter(filtered, perspective, rowStore, now, dueSoonIntervalMs)

  const expandedIds = new Set(expandAncestors(filtered.map(t => t.id), tree))
  let result = tasks.filter(t => expandedIds.has(t.id))

  if (perspective.sortBy.length > 0) {
    result = sortTasks(result, perspective.sortBy, rowStore)
  }

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

/** 8 个内置透视 */
export function builtinPerspectives(): Perspective[] {
  return [
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
      groupBy: [GROUP_KEY.TAG],
      sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
    }),
    builtin('forecast', '预测', {
      groupBy: [GROUP_KEY.DUE_DATE],
      sortBy: [{ field: SORT_FIELD.DUE_DATE, dir: SORT_DIR.ASC }],
    }),
    builtin('flagged', '旗标', {
      filter: { op: LEAF_OP.IS, field: FILTER_FIELD.FLAGGED, value: true },
      sortBy: [
        { field: SORT_FIELD.DUE_DATE, dir: SORT_DIR.ASC },
        { field: SORT_FIELD.FLAGGED, dir: SORT_DIR.DESC },
      ],
    }),
    builtin('review', '回顾', {
      availabilityFilter: AVAILABILITY_FILTER.ALL,
      groupBy: [GROUP_KEY.PROJECT],
      sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
    }),
    builtin('completed', '已完成', {
      availabilityFilter: AVAILABILITY_FILTER.ALL,
      showCompleted: true,
      groupBy: [GROUP_KEY.DUE_DATE],
      sortBy: [{ field: SORT_FIELD.ADDED_AT, dir: SORT_DIR.DESC }],
    }),
    builtin('predicted', '预计', {
      availabilityFilter: AVAILABILITY_FILTER.REMAINING,
      groupBy: [GROUP_KEY.DUE_DATE],
      sortBy: [{ field: SORT_FIELD.DUE_DATE, dir: SORT_DIR.ASC }],
    }),
  ]
}
