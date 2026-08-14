/**
 * 且/或二元树：存储恰好 2 children；UI 可将同算子左结合链摊平展示。
 */
import type { FilterNode } from './schema'
import { LOGIC_OP } from './schema'

type BinaryLogicOp = typeof LOGIC_OP.AND | typeof LOGIC_OP.OR

/** 将 ≥1 个节点左结合折成二元 and/or；单节点原样返回。 */
export function foldLogic(op: BinaryLogicOp, nodes: FilterNode[]): FilterNode {
  if (nodes.length === 0)
    throw new Error(`foldLogic(${op}) 需要至少一个节点`)
  if (nodes.length === 1)
    return nodes[0]!
  let acc = nodes[0]!
  for (let i = 1; i < nodes.length; i++)
    acc = { op, children: [acc, nodes[i]!] }
  return acc
}

/**
 * 递归规范为二元树：已是二元则恒等；n-ary / 单子 and|or 经 foldLogic 左结合折叠。
 * 编辑器打开、内置模板套用时用此把可读树收成可编辑形态；持久化仍走 validate（须二元）。
 */
export function toBinaryFilterTree(node: FilterNode): FilterNode {
  if (node.op === LOGIC_OP.AND || node.op === LOGIC_OP.OR) {
    const kids = node.children.map(toBinaryFilterTree)
    if (kids.length === 0)
      return { op: node.op, children: kids }
    return foldLogic(node.op, kids)
  }
  if (node.op === LOGIC_OP.NOT)
    return { op: LOGIC_OP.NOT, child: toBinaryFilterTree(node.child) }
  return node
}

/**
 * 同算子链摊平（仅 UI）。
 * 二元左结合只沿**左脊**展开，右孩子整颗保留——这样 `且(且(a,b), 且(c,d))` 显示为
 * `[a, b, 且(c,d)]`，嵌套分组不会被误拆。
 */
export function flattenSameLogicChain(
  node: FilterNode,
): { op: BinaryLogicOp, items: FilterNode[] } | null {
  if (node.op !== LOGIC_OP.AND && node.op !== LOGIC_OP.OR)
    return null
  const op = node.op
  const items: FilterNode[] = []
  const walk = (n: FilterNode) => {
    if (n.op !== op) {
      items.push(n)
      return
    }
    if (n.children.length !== 2) {
      throw new Error(
        `${op} 须恰好 2 个 children，收到 ${n.children.length}`,
      )
    }
    const [left, right] = n.children
    if (left!.op === op)
      walk(left!)
    else
      items.push(left!)
    items.push(right!)
  }
  walk(node)
  return { op, items }
}

/** 在同算子链尾追加一项（不同算子则外包一层）。 */
export function appendToLogicChain(
  root: FilterNode,
  op: BinaryLogicOp,
  item: FilterNode,
): FilterNode {
  if (root.op === op) {
    const flat = flattenSameLogicChain(root)
    return foldLogic(op, [...(flat?.items ?? [root]), item])
  }
  return { op, children: [root, item] }
}

/** 切换整条同算子链的 and↔or（非链则包一层二元）。 */
export function setLogicChainOp(root: FilterNode, op: BinaryLogicOp): FilterNode {
  const flat = flattenSameLogicChain(root)
  if (flat == null || flat.items.length < 2) {
    if (root.op === LOGIC_OP.AND || root.op === LOGIC_OP.OR)
      return { op, children: root.children }
    return root
  }
  return foldLogic(op, flat.items)
}
