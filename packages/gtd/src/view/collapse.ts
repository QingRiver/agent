import type { TaskNode, TaskTree } from '../structure/tree'

/**
 * L7 渲染层塌陷（草案 §4 / 重设计 §4.3 §7.2）。
 *
 * 不可见中间层（纯结构祖先）不占渲染行，孙任务透传挂最近可见祖先下、
 * 与该祖先的其他可见子同级缩进、同级排序。只读，吃 L1 tree + 渲染信息，不改数据层。
 */

/** node 自身或任一后代在 ids 中。塌陷节点自身不在 visibleIds 但后代可能可见 → 仍 true。 */
function subtreeHas(node: TaskNode, ids: Set<string>): boolean {
  if (ids.has(node.task.id))
    return true
  return node.children.some(c => subtreeHas(c, ids))
}

/** node 的后代（不含自身）含 matched。用于识别纯结构祖先——自身非 matched 但有 matched 后代。 */
function descendantHasMatched(node: TaskNode, matchedIds: Set<string>): boolean {
  return node.children.some(c => subtreeHas(c, matchedIds))
}

/**
 * 纯结构祖先集（塌陷目标）：expandedIds 内、非 matched、且后代含 matched 的节点 [SP-COLLAPSE-1]。
 *
 * expandAncestors 拉入的祖先若自身非 matched 且有 matched 后代 → 塌陷。
 * forecast 路径传空 matchedIds → 空集（不塌陷）[SP-COLLAPSE-FORECAST-NOOP]。
 */
export function computeCollapsibleSet(
  tree: TaskTree,
  matchedIds: Set<string>,
  expandedIds: Set<string>,
): Set<string> {
  const collapsible = new Set<string>()
  for (const id of expandedIds) {
    if (matchedIds.has(id))
      continue
    const node = tree.byId.get(id)
    if (!node)
      continue
    if (descendantHasMatched(node, matchedIds))
      collapsible.add(id)
  }
  return collapsible
}

/**
 * 塌陷后可见深度：数真实祖先链中「非塌陷」节点数（可见根=0）[SP-COLLAPSE-2]。
 * collapsibleSet 为空集时等价 taskDepth（forecast 路径）。
 */
export function visibleDepth(tree: TaskTree, taskId: string, collapsibleSet: Set<string>): number {
  let depth = 0
  let node = tree.byId.get(taskId)?.parent ?? null
  while (node) {
    if (!collapsibleSet.has(node.task.id))
      depth++
    node = node.parent
  }
  return depth
}

/**
 * 塌陷节点的「有效可见子」：沿真实子下行，跳过连续塌陷层，遇非塌陷且有可见后代的节点收入 [SP-COLLAPSE-3]。
 * 无可见后代的旁枝（subtreeHas=false）剪除，防止无可见后代的支被误提升进排序组。
 * 用于 flattenInTreeOrder 同级排序提升：塌陷节点的有效子上浮与最近可见祖先的真实非塌陷子同组 sortBy。
 */
export function effectiveVisibleChildren(
  node: TaskNode,
  visibleIds: Set<string>,
  collapsibleSet: Set<string>,
): TaskNode[] {
  const result: TaskNode[] = []
  for (const child of node.children) {
    if (!subtreeHas(child, visibleIds))
      continue
    if (collapsibleSet.has(child.task.id))
      result.push(...effectiveVisibleChildren(child, visibleIds, collapsibleSet))
    else
      result.push(child)
  }
  return result
}
