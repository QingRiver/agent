import type { Folder, Tag, Task } from './schema'

/** Task 树节点（action group 自引用） */
export interface TaskNode {
  task: Task
  parent: TaskNode | null
  children: TaskNode[]
}

/** Task 树：根节点列表 + id 索引，供可用性计算上溯 */
export interface TaskTree {
  roots: TaskNode[]
  byId: Map<string, TaskNode>
}

export interface FolderNode {
  folder: Folder
  parent: FolderNode | null
  children: FolderNode[]
}

export interface FolderTree {
  roots: FolderNode[]
  byId: Map<string, FolderNode>
}

export interface TagNode {
  tag: Tag
  parent: TagNode | null
  children: TagNode[]
}

export interface TagTree {
  roots: TagNode[]
  byId: Map<string, TagNode>
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

/** 由扁平 tasks 按 parentId 构建树（根为 parentId 为 null 或悬空的顶层 action） */
export function buildTaskTree(tasks: Task[]): TaskTree {
  const byId = new Map<string, TaskNode>()
  for (const task of tasks)
    byId.set(task.id, { task, parent: null, children: [] })
  const roots: TaskNode[] = []
  for (const task of tasks) {
    const node = byId.get(task.id)!
    if (task.parentId && byId.has(task.parentId)) {
      const parent = byId.get(task.parentId)!
      node.parent = parent
      parent.children.push(node)
    }
    else {
      roots.push(node)
    }
  }
  const sortNode = (a: TaskNode, b: TaskNode) => byOrder(a.task, b.task)
  roots.sort(sortNode)
  for (const node of byId.values())
    node.children.sort(sortNode)
  return { roots, byId }
}

/** 由扁平 folders 按 parentId 构建 Folder 树 */
export function buildFolderTree(folders: Folder[]): FolderTree {
  const byId = new Map<string, FolderNode>()
  for (const folder of folders)
    byId.set(folder.id, { folder, parent: null, children: [] })
  const roots: FolderNode[] = []
  for (const folder of folders) {
    const node = byId.get(folder.id)!
    if (folder.parentId && byId.has(folder.parentId)) {
      const parent = byId.get(folder.parentId)!
      node.parent = parent
      parent.children.push(node)
    }
    else {
      roots.push(node)
    }
  }
  const sortNode = (a: FolderNode, b: FolderNode) => byOrder(a.folder, b.folder)
  roots.sort(sortNode)
  for (const node of byId.values())
    node.children.sort(sortNode)
  return { roots, byId }
}

/** 由扁平 tags 按 parentId 构建 Tag 树 */
export function buildTagTree(tags: Tag[]): TagTree {
  const byId = new Map<string, TagNode>()
  for (const tag of tags)
    byId.set(tag.id, { tag, parent: null, children: [] })
  const roots: TagNode[] = []
  for (const tag of tags) {
    const node = byId.get(tag.id)!
    if (tag.parentId && byId.has(tag.parentId)) {
      const parent = byId.get(tag.parentId)!
      node.parent = parent
      parent.children.push(node)
    }
    else {
      roots.push(node)
    }
  }
  const sortNode = (a: TagNode, b: TagNode) => byOrder(a.tag, b.tag)
  roots.sort(sortNode)
  for (const node of byId.values())
    node.children.sort(sortNode)
  return { roots, byId }
}

/** 返回 taskId 的全部祖先 Task（从父到根） */
export function ancestors(tree: TaskTree, taskId: string): Task[] {
  const result: Task[] = []
  let node = tree.byId.get(taskId)?.parent ?? null
  while (node) {
    result.push(node.task)
    node = node.parent
  }
  return result
}

/** 返回 taskId 的直接子 Task（已按 order 排序） */
export function children(tree: TaskTree, taskId: string): Task[] {
  return (tree.byId.get(taskId)?.children ?? []).map(n => n.task)
}

/** 沿祖先链找最近一个满足 predicate 的 Task */
export function nearestAncestor(
  tree: TaskTree,
  taskId: string,
  predicate: (task: Task) => boolean,
): Task | null {
  let node = tree.byId.get(taskId)?.parent ?? null
  while (node) {
    if (predicate(node.task))
      return node.task
    node = node.parent
  }
  return null
}

/** 返回某 project 下的顶层 action（parentId 为 null 且归属该 project），按 order 排序 */
export function rootTasksOfProject(tasks: Task[], projectId: string): Task[] {
  return tasks
    .filter(t => t.projectId === projectId && t.parentId === null)
    .sort(byOrder)
}
