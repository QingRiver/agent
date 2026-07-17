import type {
  AvailabilityFilter,
  ComputedStatus,
  FilterRule,
  GroupKey,
  GtdDocument,
  Perspective,
  PerspectiveMatch,
  Project,
  SortKey,
  Task,
} from './schema'
import type { TaskTree } from './tree'
import { computeStatus } from './availability'
import { needsReview } from './review'
import { buildTaskTree } from './tree'
import {
  AVAILABILITY_FILTER,
  COMPUTED_STATUS,
  EXPLICIT_STATUS,
  FILTER_FIELD,
  FILTER_OP,
  GROUP_KEY,
  PERSPECTIVE_MATCH,
  SORT_DIR,
  SORT_FIELD,
} from './types'

/**
 * 透视引擎（SPEC §5.5）。纯函数 renderPerspective 产出 RenderTree。
 */

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
  doc: GtdDocument
  tree: TaskTree
  now: Date
  dueSoonIntervalMs: number
  statusCache: Map<string, ComputedStatus>
}

/** 取 task 在某 field 上的原始值（过滤/排序共用） */
function rawValue(task: Task, field: string, doc: GtdDocument): unknown {
  switch (field) {
    case FILTER_FIELD.STATUS: return task.status
    case FILTER_FIELD.PROJECT: return task.projectId
    case FILTER_FIELD.FOLDER: {
      const proj = doc.projects.find(p => p.id === task.projectId)
      return proj?.folderId ?? null
    }
    case FILTER_FIELD.TAG: return task.tagIds
    case FILTER_FIELD.DEFER_DATE: return task.deferDate
    case FILTER_FIELD.DUE_DATE: return task.dueDate
    case FILTER_FIELD.FLAGGED: return task.flagged
    case FILTER_FIELD.ESTIMATE: return task.estimateMinutes
    default: return null
  }
}

function isEmptyValue(v: unknown): boolean {
  return v == null || (Array.isArray(v) && v.length === 0)
}

function isDateField(field: string): boolean {
  return field === FILTER_FIELD.DEFER_DATE || field === FILTER_FIELD.DUE_DATE
}

function isEstimateField(field: string): boolean {
  return field === FILTER_FIELD.ESTIMATE
}

function isTagField(field: string): boolean {
  return field === FILTER_FIELD.TAG
}

function evaluateEq(field: string, v: unknown, target: unknown): boolean {
  if (isTagField(field))
    return Array.isArray(v) && typeof target === 'string' && v.includes(target)
  return v === target
}

function evaluateNe(field: string, v: unknown, target: unknown): boolean {
  if (isTagField(field))
    return !Array.isArray(v) || !v.includes(target as string)
  return v !== target
}

function evaluateIn(_field: string, v: unknown, target: unknown): boolean {
  if (!Array.isArray(target))
    return false
  if (Array.isArray(v))
    return target.some(t => (v as unknown[]).includes(t))
  return target.includes(v)
}

function evaluateBetween(field: string, v: unknown, target: unknown): boolean {
  if (!Array.isArray(target) || target.length !== 2 || isEmptyValue(v))
    return false
  if (isEstimateField(field)) {
    const n = v as number
    const lo = target[0] as number
    const hi = target[1] as number
    return n >= lo && n <= hi
  }
  if (isDateField(field)) {
    const ms = new Date(v as string).getTime()
    return ms >= new Date(target[0] as string).getTime()
      && ms <= new Date(target[1] as string).getTime()
  }
  return false
}

function evaluateBefore(field: string, v: unknown, target: unknown): boolean {
  if (v == null || target == null)
    return false
  if (isEstimateField(field))
    return (v as number) < (target as number)
  if (isDateField(field))
    return new Date(v as string).getTime() < new Date(target as string).getTime()
  return false
}

function evaluateAfter(field: string, v: unknown, target: unknown): boolean {
  if (v == null || target == null)
    return false
  if (isEstimateField(field))
    return (v as number) > (target as number)
  if (isDateField(field))
    return new Date(v as string).getTime() > new Date(target as string).getTime()
  return false
}

/** 求值单条过滤规则对 task 是否命中（FilterField × Op 求值表，SPEC §5.5.3） */
export function evaluateFilter(
  task: Task,
  rule: FilterRule,
  doc: GtdDocument,
  _now: Date,
  _dueSoonIntervalMs: number,
): boolean {
  const v = rawValue(task, rule.field, doc)
  const target = rule.value
  switch (rule.op) {
    case FILTER_OP.EQ:
      return evaluateEq(rule.field, v, target)
    case FILTER_OP.NE:
      return evaluateNe(rule.field, v, target)
    case FILTER_OP.IN:
      return evaluateIn(rule.field, v, target)
    case FILTER_OP.BETWEEN:
      return evaluateBetween(rule.field, v, target)
    case FILTER_OP.BEFORE:
      return evaluateBefore(rule.field, v, target)
    case FILTER_OP.AFTER:
      return evaluateAfter(rule.field, v, target)
    case FILTER_OP.IS_NULL:
      return isEmptyValue(v)
    case FILTER_OP.IS_NOT_NULL:
      return !isEmptyValue(v)
    default: {
      const _exhaustive: never = rule.op
      void _exhaustive
      return false
    }
  }
}

/** 按 matchMode(all=AND/any=OR) 聚合多条规则 */
export function matchFilters(
  task: Task,
  rules: FilterRule[],
  matchMode: PerspectiveMatch,
  doc: GtdDocument,
  now: Date,
  dueSoonIntervalMs: number,
): boolean {
  if (rules.length === 0)
    return true
  const results = rules.map(r => evaluateFilter(task, r, doc, now, dueSoonIntervalMs))
  return matchMode === PERSPECTIVE_MATCH.ALL
    ? results.every(Boolean)
    : results.some(Boolean)
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

function taskComputed(task: Task, ctx: RenderContext): ComputedStatus {
  return computeStatus(
    task,
    ctx.now,
    ctx.tree,
    ctx.dueSoonIntervalMs,
    ctx.doc.projects,
    ctx.statusCache,
  )
}

/** Step1 基础过滤：availabilityFilter + showCompleted/showDropped + flaggedOnly */
export function applyBaseFilter(
  tasks: Task[],
  perspective: Pick<Perspective, 'availabilityFilter' | 'showCompleted' | 'showDropped' | 'flaggedOnly'>,
  ctx: RenderContext,
): Task[] {
  return tasks.filter((t) => {
    if (!perspective.showCompleted && t.status === EXPLICIT_STATUS.COMPLETED)
      return false
    if (
      !perspective.showDropped
      && (t.status === EXPLICIT_STATUS.CANCELLED || t.status === EXPLICIT_STATUS.DELETED)
    ) {
      return false
    }
    if (perspective.flaggedOnly === true && !t.flagged)
      return false

    if (perspective.availabilityFilter === AVAILABILITY_FILTER.ALL)
      return true
    if (perspective.availabilityFilter === AVAILABILITY_FILTER.REMAINING)
      return t.status === EXPLICIT_STATUS.ACTIVE

    const computed = taskComputed(t, ctx)
    return isActionable(computed)
  })
}

/** @deprecated 使用 applyBaseFilter；保留兼容单测 */
export function applyAvailabilityFilter(
  tasks: Task[],
  filter: AvailabilityFilter,
  tree: TaskTree,
  now: Date,
  dueSoonIntervalMs: number,
  projects: Project[] = [],
): Task[] {
  const ctx: RenderContext = {
    doc: { version: '1', meta: { createdAt: now.toISOString(), updatedAt: now.toISOString(), schemaVersion: '1' }, folders: [], projects, tags: [], tasks, perspectives: [], repeatRules: [], attachments: [] },
    tree,
    now,
    dueSoonIntervalMs,
    statusCache: new Map(),
  }
  return applyBaseFilter(tasks, {
    availabilityFilter: filter,
    showCompleted: filter === AVAILABILITY_FILTER.ALL,
    showDropped: filter === AVAILABILITY_FILTER.ALL,
    flaggedOnly: null,
  }, ctx)
}

/** 内置透视 id 的额外过滤（SPEC §5.5.8 中无法仅用 filterRules 表达的部分） */
export function applyBuiltinFilter(
  tasks: Task[],
  perspective: Perspective,
  doc: GtdDocument,
  now: Date,
  dueSoonIntervalMs: number,
): Task[] {
  switch (perspective.id) {
    case 'inbox':
      return tasks.filter(t => t.projectId === null && t.parentId === null)
    case 'review':
      return tasks.filter((t) => {
        if (!t.projectId)
          return false
        const project = doc.projects.find(p => p.id === t.projectId)
        return project ? needsReview(project, now) : false
      })
    case 'completed':
      return tasks.filter(t => t.status === EXPLICIT_STATUS.COMPLETED)
    case 'predicted':
      return tasks.filter(t => t.dueDate != null)
    case 'forecast': {
      const horizon = new Date(now.getTime() + dueSoonIntervalMs * 7)
      return tasks.filter((t) => {
        if (!t.dueDate)
          return false
        const due = new Date(t.dueDate).getTime()
        return due >= now.getTime() && due <= horizon.getTime()
      })
    }
    default:
      return tasks
  }
}

/** Step3 父级展开：补齐命中 task 的祖先链 id */
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
function groupValues(task: Task, key: GroupKey, doc: GtdDocument): string[] {
  switch (key) {
    case GROUP_KEY.PROJECT: return [task.projectId ?? '']
    case GROUP_KEY.FOLDER: {
      const proj = doc.projects.find(p => p.id === task.projectId)
      return [proj?.folderId ?? '']
    }
    case GROUP_KEY.TAG: return task.tagIds.length ? task.tagIds : ['']
    case GROUP_KEY.DEFER_DATE: return [task.deferDate ?? '']
    case GROUP_KEY.DUE_DATE: return [task.dueDate ?? '']
    case GROUP_KEY.FLAGGED: return [String(task.flagged)]
    case GROUP_KEY.STATUS: return [task.status]
    case GROUP_KEY.NONE: return ['']
    default: return ['']
  }
}

function toRenderItem(task: Task, ctx: RenderContext): RenderItem {
  return {
    taskId: task.id,
    computed: taskComputed(task, ctx),
    depth: taskDepth(ctx.tree, task.id),
  }
}

/** Step4 分组：按多级 groupBy 聚合（tag 多归属一 task 进多组） */
export function groupBy(
  tasks: Task[],
  keys: GroupKey[],
  doc: GtdDocument,
  ctx: RenderContext,
): RenderGroup[] {
  if (keys.length === 0)
    return [{ key: '', label: '', children: tasks.map(t => toRenderItem(t, ctx)) }]
  const first = keys[0]!
  const rest = keys.slice(1)
  const buckets = new Map<string, Task[]>()
  for (const t of tasks) {
    for (const gv of groupValues(t, first, doc)) {
      const arr = buckets.get(gv) ?? []
      arr.push(t)
      buckets.set(gv, arr)
    }
  }
  return [...buckets.entries()].map(([key, ts]) => ({
    key,
    label: key,
    children: rest.length ? groupBy(ts, rest, doc, ctx) : ts.map(t => toRenderItem(t, ctx)),
  }))
}

function compareField(a: Task, b: Task, field: string, doc: GtdDocument): number {
  const va = rawValue(a, field, doc)
  const vb = rawValue(b, field, doc)
  if (va == null && vb == null)
    return 0
  if (va == null)
    return 1
  if (vb == null)
    return -1
  if (field === FILTER_FIELD.DUE_DATE || field === FILTER_FIELD.DEFER_DATE)
    return new Date(va as string).getTime() - new Date(vb as string).getTime()
  if (field === SORT_FIELD.ADDED_AT)
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  if (field === FILTER_FIELD.FLAGGED || field === SORT_FIELD.FLAGGED)
    return (va as boolean ? 1 : 0) - (vb as boolean ? 1 : 0)
  if (field === FILTER_FIELD.ESTIMATE || field === SORT_FIELD.ESTIMATE)
    return (va as number) - (vb as number)
  if (field === SORT_FIELD.NAME)
    return String(a.name).localeCompare(String(b.name))
  if (field === SORT_FIELD.ORDER)
    return a.order - b.order
  return 0
}

/** Step5 排序：组内多级 sortBy（null 末尾，dir 升降序） */
export function sortTasks(tasks: Task[], sortBy: SortKey[], doc: GtdDocument): Task[] {
  const sorted = [...tasks]
  sorted.sort((a, b) => {
    for (const key of sortBy) {
      const cmp = compareField(a, b, key.field, doc)
      if (cmp !== 0)
        return key.dir === SORT_DIR.ASC ? cmp : -cmp
    }
    return 0
  })
  return sorted
}

/** 完整渲染管线：6 步产出顶层 RenderGroup[]（SPEC §5.5.1） */
export function renderPerspective(
  doc: GtdDocument,
  perspective: Perspective,
  now: Date,
  dueSoonIntervalMs: number,
): RenderGroup[] {
  const tree = buildTaskTree(doc.tasks)
  const ctx: RenderContext = {
    doc,
    tree,
    now,
    dueSoonIntervalMs,
    statusCache: new Map(),
  }

  let tasks = applyBaseFilter(doc.tasks, perspective, ctx)
  tasks = tasks.filter(t =>
    matchFilters(t, perspective.filterRules, perspective.matchMode, doc, now, dueSoonIntervalMs),
  )
  tasks = applyBuiltinFilter(tasks, perspective, doc, now, dueSoonIntervalMs)

  const expandedIds = new Set(expandAncestors(tasks.map(t => t.id), tree))
  tasks = doc.tasks.filter(t => expandedIds.has(t.id))

  if (perspective.sortBy.length > 0)
    tasks = sortTasks(tasks, perspective.sortBy, doc)

  return groupBy(tasks, perspective.groupBy, doc, ctx)
}

function builtin(id: string, name: string, overrides: Partial<Perspective> = {}): Perspective {
  return {
    id,
    name,
    icon: null,
    matchMode: PERSPECTIVE_MATCH.ALL,
    filterRules: [],
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

/** 8 个内置透视：收件箱/项目/标签/预测/旗标/回顾/已完成/预计 */
export function builtinPerspectives(): Perspective[] {
  return [
    builtin('inbox', '收件箱', {
      availabilityFilter: AVAILABILITY_FILTER.REMAINING,
      filterRules: [
        { field: FILTER_FIELD.PROJECT, op: FILTER_OP.IS_NULL, value: null },
      ],
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
      filterRules: [{ field: FILTER_FIELD.FLAGGED, op: FILTER_OP.EQ, value: true }],
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
