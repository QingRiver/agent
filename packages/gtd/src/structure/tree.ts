import type { EntityRowOf } from '../data/row-schema'

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
