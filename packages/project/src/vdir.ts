import type { DirRow } from './schema'

/**
 * vdir（name 链）派生。
 *
 * `vdir` 是 name 链（Qdrant payload + 展示用）。结构靠 `parentId` 链表达（无 ltree/path
 * 物化列）。改名/移动均重算 vdir；rename 不动结构（parentId/projectId 不变）。
 * 根级 vdir = name 自身。
 */

/**
 * 由父 vdir + 自身 name 派生 vdir。
 *
 * - `parentVdir` 为 null（project 根）→ `name`
 * - 否则 → `${parentVdir}/${name}`
 */
export function dirVdir(parentVdir: string | null, name: string): string {
  return parentVdir == null ? name : `${parentVdir}/${name}`
}

/**
 * rename/move 后重算子树 vdir。
 *
 * 输入子树所有节点（根 + 后代，name 已为目标值；parentId 为子树内部关系）。
 * 根的 parentId 指向旧父（不在子树集合）故识别为顶层。返回每个节点的新 vdir。
 */
export function recomputeSubtreeVdirs(
  subtreeNodes: DirRow[],
  newParentVdir: string | null,
): Map<string, string> {
  const byId = new Map(subtreeNodes.map(n => [n.id, n]))
  const result = new Map<string, string>()
  const roots = subtreeNodes.filter(n => n.parentId == null || !byId.has(n.parentId))
  const stack: Array<{ id: string, vdir: string }> = []
  for (const r of roots)
    stack.push({ id: r.id, vdir: dirVdir(newParentVdir, r.name) })
  while (stack.length > 0) {
    const { id, vdir } = stack.pop()!
    result.set(id, vdir)
    for (const child of subtreeNodes) {
      if (child.parentId === id)
        stack.push({ id: child.id, vdir: dirVdir(vdir, child.name) })
    }
  }
  return result
}
