import type { DirRow } from './schema'
import { ProjectDirError } from './dir'
import { DIR_KIND, MAX_DEPTH } from './types'

/**
 * Dir 树结构操作（内存组装 + 祖先链 + move/delete 校验）。
 *
 * 无 ltree/path 物化列——结构靠 `parentId` 链表达。service 层「按 projectId 拉全树」
 * 后用 {@link buildDirTree} 组装内存树，所有层级判断（防环/depth/子树/walkToRoot）
 * 在内存做。rename 不动结构（parentId 不变）；move 改 parentId + 重算子树 vdir +
 * 跨 project 级联 projectId。
 */

/** Dir 树节点（扁平 rows → 树） */
export interface DirTreeNode {
  dir: DirRow
  children: DirTreeNode[]
  /** 深度：project 根 = 0，每层 dir +1 */
  depth: number
}

/** Dir 树：根列表 + id 索引 */
export interface DirTree {
  roots: DirTreeNode[]
  byId: Map<string, DirTreeNode>
}

const byOrder = (a: DirTreeNode, b: DirTreeNode): number => a.dir.sortOrder - b.dir.sortOrder

/**
 * 由扁平 rows 按 parentId 构建树（含 depth）。
 *
 * parentId 悬空（指向不在集合内的行）的视为顶层。按 sortOrder 排序。
 * **不过滤 deleted**——调用方按需 `rows.filter(isLive)` 后再传入。
 */
export function buildDirTree(rows: DirRow[]): DirTree {
  const byId = new Map<string, DirTreeNode>()
  for (const dir of rows)
    byId.set(dir.id, { dir, children: [], depth: 0 })
  const roots: DirTreeNode[] = []
  for (const dir of rows) {
    const node = byId.get(dir.id)!
    if (dir.parentId != null && byId.has(dir.parentId)) {
      const parent = byId.get(dir.parentId)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    }
    else {
      node.depth = 0
      roots.push(node)
    }
  }
  roots.sort(byOrder)
  for (const n of byId.values())
    n.children.sort(byOrder)
  return { roots, byId }
}

/**
 * 子树高度（含自身）：无子 = 1，否则 1 + max(子树高度)。
 *
 * 用于 move depth 校验：移后最深处 = `newParent.depth + subtreeHeight(node) ≤ MAX_DEPTH`。
 */
export function subtreeHeight(node: DirTreeNode): number {
  if (node.children.length === 0)
    return 1
  let max = 0
  for (const c of node.children)
    max = Math.max(max, subtreeHeight(c))
  return 1 + max
}

/**
 * `ancestorId` 是否为 `descendantId` 的祖先（含自身）。
 *
 * 沿 `descendantId` 的 parentId 链向上查 ancestor，O(depth)。用于 move 防环：
 * newParent 不得是被移节点的祖先（含自身）。
 */
export function isAncestorOrSelf(
  ancestorId: string,
  descendantId: string,
  byId: Map<string, DirTreeNode>,
): boolean {
  const guard = new Set<string>()
  let cur: string | null = descendantId
  while (cur != null && !guard.has(cur)) {
    guard.add(cur)
    if (cur === ancestorId)
      return true
    cur = byId.get(cur)?.dir.parentId ?? null
  }
  return false
}

/**
 * 沿 parentId 链向上走到 kind=project 根，返回该 project id。
 *
 * - `dirId` 为 null（Inbox / 无挂载）→ null
 * - `dirId` 自身是 project → 自身 id
 * - 链断裂（parentId 指向 byId 不存在的行）→ null（不变量被破坏，保守返 null）
 * - 防环：guard Set，遇已访问节点终止返 null
 *
 * 用于派生/校验 `projectId` 缓存（运行时权威是 `DirRow.projectId` 列）。
 */
export function walkToProjectRoot(dirId: string | null, byId: Map<string, DirRow>): string | null {
  if (dirId == null)
    return null
  const guard = new Set<string>()
  let cur: string | null = dirId
  while (cur != null && !guard.has(cur)) {
    guard.add(cur)
    const node = byId.get(cur)
    if (!node)
      return null
    if (node.kind === DIR_KIND.PROJECT)
      return node.id
    cur = node.parentId
  }
  return null
}

/**
 * move 前置结构校验（**不含 ACL**，ACL 由 service 层调 acl.ts 单独查）。
 *
 * - project 不可移动（仅作根）
 * - dir 不可移成根（newParent 不可为 null）
 * - 防环：newParent 不得是 node 的祖先（含自身），沿祖先链查
 * - 深度：`newParent.depth + subtreeHeight(node) ≤ MAX_DEPTH`
 * - 同级名唯一：newParent 现有子项不得有同名
 *
 * @param node 被移节点（DirRow）
 * @param newParent 新父（dir 须非 null）
 * @param tree node 所在 project 的全树（含 newParent），用于祖先链/depth/子树高度
 * @param siblingNames newParent 现有未删子项 name 列表（不含 node 自身）
 */
export function assertMoveValid(
  node: DirRow,
  newParent: DirRow | null,
  tree: DirTree,
  siblingNames: string[],
): void {
  if (node.kind === DIR_KIND.PROJECT)
    throw new ProjectDirError('project 不可移动（仅作根）')
  if (newParent == null)
    throw new ProjectDirError('dir 不可移成根')
  if (isAncestorOrSelf(node.id, newParent.id, tree.byId))
    throw new ProjectDirError('不可移入自身或自身后代')

  const nodeNode = tree.byId.get(node.id)
  const parentNode = tree.byId.get(newParent.id)
  if (!nodeNode || !parentNode)
    throw new ProjectDirError('节点不在树内')
  const newMaxDepth = parentNode.depth + subtreeHeight(nodeNode)
  if (newMaxDepth > MAX_DEPTH)
    throw new ProjectDirError(`超过 ${MAX_DEPTH} 层嵌套上限`)

  if (siblingNames.includes(node.name))
    throw new ProjectDirError(`同级已存在同名: ${node.name}`)
}

/**
 * delete（v1）前置校验：dir/project **须空**才能删。
 *
 * 非空（有子 dir 或有挂载实体）→ throw；级联删延后（v2）。
 */
export function assertCanDelete(hasChildren: boolean, hasMounts: boolean): void {
  if (hasChildren || hasMounts)
    throw new ProjectDirError('dir/project 须空才能删（无子 dir + 无挂载实体）')
}

/**
 * 跨 project move 时子树的新 projectId（dirs + 挂载实体统一翻新）。
 *
 * move 子树后，子树内所有 dir + 挂载实体（task/doc）的 `projectId` = 新 project 根。
 * - `oldRoot === newRoot`（同 project 内 move）→ **null**（不动 projectId）
 * - 否则 → `newRoot`（子树一切 projectId 翻新）
 *
 * @param oldRoot 被移节点原所属 project 根 id
 * @param newRoot 新父所属 project 根 id
 * @returns 新 projectId（null = 无需更新）
 */
export function movedProjectId(oldRoot: string, newRoot: string): string | null {
  return oldRoot === newRoot ? null : newRoot
}

/**
 * 收集 `rootDirId` 子树全部 dir id（**含自身**），供 Qdrant 子树召回过滤
 * （`mount_dir_id ∈ subtreeDirIds`）。O(子树大小)。
 *
 * dir 改名/同 project move 时 dir id 不变 → 召回零成本；仅跨 project move
 * 改 `project_id`、doc move 改 `mount_dir_id` 才动 Qdrant payload。
 *
 * @param tree node 所在 project 的全树（service 层「按 projectId 拉全树」后组装）
 * @param rootDirId 子树根（含自身：docs 直接挂本节点也要召回）
 * @returns 子树全部 dir id；rootDirId 不在树内 → 空 Set
 */
export function subtreeDirIds(tree: DirTree, rootDirId: string): Set<string> {
  const ids = new Set<string>()
  const start = tree.byId.get(rootDirId)
  if (!start)
    return ids
  const stack: DirTreeNode[] = [start]
  while (stack.length > 0) {
    const n = stack.pop()!
    ids.add(n.dir.id)
    for (const c of n.children)
      stack.push(c)
  }
  return ids
}
