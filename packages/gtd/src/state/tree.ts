import type { EntityRowOf } from '../data/row-schema'
import type { ExplicitStatusValue } from '../data/types'
import { EXPLICIT_STATUS, PLANNED_MODE } from '../data/types'

/** Task 树节点（action group 自引用） */
export interface TaskNode {
  task: EntityRowOf<'task'>
  parent: TaskNode | null
  children: TaskNode[]
}

/** Task 树：根节点列表 + id 索引，供可用性计算上溯 */
export interface TaskTree {
  roots: TaskNode[]
  byId: Map<string, TaskNode>
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

/** 环里被断开的节点：syncId（最后一次写入的序号）最大者，同号取 id 较大者。 */
function cycleBreaker(cycle: EntityRowOf<'task'>[]): string {
  let pick = cycle[0]!
  for (const task of cycle) {
    if (task.syncId > pick.syncId || (task.syncId === pick.syncId && task.id > pick.id))
      pick = task
  }
  return pick.id
}

/**
 * 每个任务的有效父 id。指向自身、指向不存在的任务视为根；
 * parentId 各自后写赢可能拼出环，环里由 cycleBreaker 选出的节点视为根。
 */
function resolveParents(tasks: EntityRowOf<'task'>[]): Map<string, string | null> {
  const ids = new Set(tasks.map(t => t.id))
  const parentOf = new Map<string, string | null>()
  for (const task of tasks) {
    const parentId = task.data.parentId
    parentOf.set(task.id, parentId && parentId !== task.id && ids.has(parentId) ? parentId : null)
  }
  const byId = new Map(tasks.map(t => [t.id, t]))
  const done = new Set<string>()
  for (const task of tasks) {
    const path: string[] = []
    const onPath = new Map<string, number>()
    let cur: string | null = task.id
    while (cur != null && !done.has(cur) && !onPath.has(cur)) {
      onPath.set(cur, path.length)
      path.push(cur)
      cur = parentOf.get(cur) ?? null
    }
    if (cur != null && onPath.has(cur)) {
      const cycle = path.slice(onPath.get(cur)!).map(id => byId.get(id)!)
      parentOf.set(cycleBreaker(cycle), null)
    }
    for (const id of path)
      done.add(id)
  }
  return parentOf
}

/** 由扁平 tasks 按 parentId 构建树（根为 parentId 为 null、悬空、指向自身或被断开的环节点） */
export function buildTaskTree(tasks: EntityRowOf<'task'>[]): TaskTree {
  const byId = new Map<string, TaskNode>()
  for (const task of tasks)
    byId.set(task.id, { task, parent: null, children: [] })
  const parentOf = resolveParents(tasks)
  const roots: TaskNode[] = []
  for (const task of tasks) {
    const node = byId.get(task.id)!
    const parentId = parentOf.get(task.id)
    if (parentId) {
      const parent = byId.get(parentId)!
      node.parent = parent
      parent.children.push(node)
    }
    else {
      roots.push(node)
    }
  }
  const sortNode = (a: TaskNode, b: TaskNode) => byOrder(a.task.data, b.task.data)
  roots.sort(sortNode)
  for (const node of byId.values())
    node.children.sort(sortNode)
  return { roots, byId }
}

/** 返回 taskId 在树中的深度（根为 0） */
export function taskDepth(tree: TaskTree, taskId: string): number {
  let depth = 0
  let node = tree.byId.get(taskId)?.parent ?? null
  while (node) {
    depth++
    node = node.parent
  }
  return depth
}

/** 返回 taskId 的全部祖先 Task（从父到根） */
export function ancestors(tree: TaskTree, taskId: string): EntityRowOf<'task'>[] {
  const result: EntityRowOf<'task'>[] = []
  let node = tree.byId.get(taskId)?.parent ?? null
  while (node) {
    result.push(node.task)
    node = node.parent
  }
  return result
}

/** 返回 taskId 的直接子 Task（已按 order 排序） */
export function children(tree: TaskTree, taskId: string): EntityRowOf<'task'>[] {
  return (tree.byId.get(taskId)?.children ?? []).map(n => n.task)
}

/** 返回 taskId 的全部后代 Task（深度优先，不含自身；各层已按 order 排序） */
export function subtree(tree: TaskTree, taskId: string): EntityRowOf<'task'>[] {
  const result: EntityRowOf<'task'>[] = []
  const visit = (node: TaskNode | undefined): void => {
    if (!node)
      return
    for (const child of node.children) {
      result.push(child.task)
      visit(child)
    }
  }
  visit(tree.byId.get(taskId))
  return result
}

/** 后代 task id 列表（不含自身）；等价于 `subtree(...).map(t => t.id)` */
export function descendantTaskIds(tree: TaskTree, taskId: string): string[] {
  return subtree(tree, taskId).map(t => t.id)
}

/** 沿祖先链找最近一个满足 predicate 的 Task */
export function nearestAncestor(
  tree: TaskTree,
  taskId: string,
  predicate: (task: EntityRowOf<'task'>) => boolean,
): EntityRowOf<'task'> | null {
  let node = tree.byId.get(taskId)?.parent ?? null
  while (node) {
    if (predicate(node.task))
      return node.task
    node = node.parent
  }
  return null
}

type Iso = string | null
type PlannedMode = (typeof PLANNED_MODE)[keyof typeof PLANNED_MODE]

function minIso(a: Iso, b: Iso): Iso {
  if (a == null)
    return b
  if (b == null)
    return a
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b
}

function maxIso(a: Iso, b: Iso): Iso {
  if (a == null)
    return b
  if (b == null)
    return a
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b
}

/** effective 截止日：沿祖先链取最早 dueDate，null 视为无约束。 */
export function effectiveDue(task: EntityRowOf<'task'>, tree: TaskTree): Iso {
  let acc: Iso = task.data.dueDate
  for (const anc of ancestors(tree, task.id))
    acc = minIso(acc, anc.data.dueDate)
  return acc
}

/** effective 推迟日：沿链取最晚 deferDate，再钳到 effectiveDue。全链无 defer 则保持 null。 */
export function effectiveDefer(task: EntityRowOf<'task'>, tree: TaskTree): Iso {
  let acc: Iso = task.data.deferDate
  for (const anc of ancestors(tree, task.id))
    acc = maxIso(acc, anc.data.deferDate)
  if (acc == null)
    return null
  return minIso(acc, effectiveDue(task, tree))
}

function hasOwnPlanned(task: EntityRowOf<'task'>): boolean {
  const mode = task.data.plannedMode ?? PLANNED_MODE.NONE
  return mode !== PLANNED_MODE.NONE
}

export function effectivePlannedMode(task: EntityRowOf<'task'>, tree: TaskTree): PlannedMode {
  if (hasOwnPlanned(task))
    return task.data.plannedMode ?? PLANNED_MODE.NONE
  for (const anc of ancestors(tree, task.id)) {
    if (hasOwnPlanned(anc))
      return anc.data.plannedMode ?? PLANNED_MODE.NONE
  }
  return PLANNED_MODE.NONE
}

export function effectivePlannedDate(task: EntityRowOf<'task'>, tree: TaskTree): Iso {
  const selfMode = task.data.plannedMode ?? PLANNED_MODE.NONE
  if (selfMode === PLANNED_MODE.ON)
    return task.data.plannedDate
  if (selfMode === PLANNED_MODE.ROLLING)
    return null
  for (const anc of ancestors(tree, task.id)) {
    const mode = anc.data.plannedMode ?? PLANNED_MODE.NONE
    if (mode === PLANNED_MODE.ON)
      return anc.data.plannedDate
    if (mode === PLANNED_MODE.ROLLING)
      return null
  }
  return null
}

/** 有效挂载：只看根任务的 mountDirId。目录无效时视为 Inbox。 */
export function effectiveMountDirId(
  task: EntityRowOf<'task'>,
  tree: TaskTree,
  isMountValid: (dirId: string) => boolean = () => true,
): string | null {
  const chain = ancestors(tree, task.id)
  const root = chain.at(-1) ?? task
  const mount = root.data.mountDirId ?? null
  return mount != null && isMountValid(mount) ? mount : null
}

/**
 * 有效状态：删除沿链优先；否则从根往下，第一个搁置或完成决定有效状态。
 */
export function effectiveStatus(task: EntityRowOf<'task'>, tree: TaskTree): ExplicitStatusValue {
  if (task.data.status === EXPLICIT_STATUS.DELETED)
    return EXPLICIT_STATUS.DELETED
  for (const anc of ancestors(tree, task.id)) {
    if (anc.data.status === EXPLICIT_STATUS.DELETED)
      return EXPLICIT_STATUS.DELETED
  }
  const path = [...ancestors(tree, task.id)].reverse()
  path.push(task)
  for (const node of path) {
    if (node.data.status === EXPLICIT_STATUS.HOLD || node.data.status === EXPLICIT_STATUS.COMPLETED)
      return node.data.status
  }
  return EXPLICIT_STATUS.ACTIVE
}
