import type { EntityRowOf } from '../data/sync-schema'

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

/** 由扁平 tasks 按 parentId 构建树（根为 parentId 为 null 或悬空的顶层 action） */
export function buildTaskTree(tasks: EntityRowOf<'task'>[]): TaskTree {
  const byId = new Map<string, TaskNode>()
  for (const task of tasks)
    byId.set(task.id, { task, parent: null, children: [] })
  const roots: TaskNode[] = []
  for (const task of tasks) {
    const node = byId.get(task.id)!
    const parentId = task.data.parentId
    if (parentId && byId.has(parentId)) {
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

/** 扁平 tag 列表，按 name 排序 */
export function sortTags(tags: EntityRowOf<'tag'>[]): EntityRowOf<'tag'>[] {
  return [...tags].sort((a, b) => a.data.name.localeCompare(b.data.name))
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

/** 返回某 project 下的顶层 action（parentId 为 null 且归属该 project），按 order 排序 */
export function rootTasksOfProject(tasks: EntityRowOf<'task'>[], projectId: string): EntityRowOf<'task'>[] {
  return tasks
    .filter(t => t.data.projectId === projectId && t.data.parentId === null)
    .sort((a, b) => byOrder(a.data, b.data))
}
