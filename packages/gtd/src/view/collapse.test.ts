import type { TaskTree } from '../structure/tree'
import { describe, expect, it } from 'vitest'
import { makeTaskRow } from '../fixtures'
import { buildTaskTree } from '../structure/tree'
import { computeCollapsibleSet, effectiveVisibleChildren, visibleDepth } from './collapse'

function treeOf(ids: string[]): TaskTree {
  // ids 形如 'a' / 'b>a'（parentId）；按 token 构造父子树
  const rows = ids.map((token) => {
    const [id, parentId] = token.split('>')
    return makeTaskRow(id!, parentId ? { parentId } : {})
  })
  return buildTaskTree(rows)
}

describe('computeCollapsibleSet [SP-COLLAPSE-1]', () => {
  it('两层都 matched → 无塌陷', () => {
    const tree = treeOf(['a', 'b>a'])
    const collapsible = computeCollapsibleSet(tree, new Set(['a', 'b']), new Set(['a', 'b']))
    expect(collapsible).toEqual(new Set())
  })

  it('三层中间层：A>C matched、B 纯结构祖先 → 塌陷 B', () => {
    const tree = treeOf(['a', 'b>a', 'c>b'])
    const collapsible = computeCollapsibleSet(tree, new Set(['a', 'c']), new Set(['a', 'b', 'c']))
    expect(collapsible).toEqual(new Set(['b']))
  })

  it('expandDescendants 子孙不误塌陷：A matched、B 子孙无 matched 后代 → 空集', () => {
    const tree = treeOf(['a', 'b>a'])
    const collapsible = computeCollapsibleSet(tree, new Set(['a']), new Set(['a', 'b']))
    expect(collapsible).toEqual(new Set())
  })

  it('全链塌陷：A>D matched、B/C 纯结构祖先 → 塌陷 {B,C}', () => {
    const tree = treeOf(['a', 'b>a', 'c>b', 'd>c'])
    const collapsible = computeCollapsibleSet(tree, new Set(['a', 'd']), new Set(['a', 'b', 'c', 'd']))
    expect(collapsible).toEqual(new Set(['b', 'c']))
  })

  it('forecast 空集：matchedIds/expandedIds 空 → 空集 [SP-COLLAPSE-FORECAST-NOOP]', () => {
    const tree = treeOf(['a'])
    const collapsible = computeCollapsibleSet(tree, new Set(), new Set())
    expect(collapsible).toEqual(new Set())
  })
})

describe('visibleDepth [SP-COLLAPSE-2]', () => {
  it('根 depth=0', () => {
    const tree = treeOf(['a'])
    expect(visibleDepth(tree, 'a', new Set())).toBe(0)
  })

  it('空集等价 taskDepth：A>B>C 查 C → 2', () => {
    const tree = treeOf(['a', 'b>a', 'c>b'])
    expect(visibleDepth(tree, 'c', new Set())).toBe(2)
  })

  it('跳过塌陷祖先：A>B(塌陷)>C 查 C → 1（只计 A）', () => {
    const tree = treeOf(['a', 'b>a', 'c>b'])
    expect(visibleDepth(tree, 'c', new Set(['b']))).toBe(1)
  })

  it('matched 自身：A 查 A → 0', () => {
    const tree = treeOf(['a', 'b>a', 'c>b'])
    expect(visibleDepth(tree, 'a', new Set(['b']))).toBe(0)
  })

  it('全链塌陷：A>B(塌陷)>C(塌陷)>D 查 D → 1（只计 A）', () => {
    const tree = treeOf(['a', 'b>a', 'c>b', 'd>c'])
    expect(visibleDepth(tree, 'd', new Set(['b', 'c']))).toBe(1)
  })
})

describe('effectiveVisibleChildren [SP-COLLAPSE-3]', () => {
  it('单层塌陷：B 塌陷，有效子 = [C]', () => {
    const tree = treeOf(['a', 'b>a', 'c>b'])
    const visibleIds = new Set(['a', 'c'])
    const collapsible = new Set(['b'])
    const node = tree.byId.get('b')
    expect(node).toBeDefined()
    const eff = effectiveVisibleChildren(node!, visibleIds, collapsible)
    expect(eff.map(n => n.task.id)).toEqual(['c'])
  })

  it('链式塌陷：B>X 均塌陷，有效子 = [C]', () => {
    const tree = treeOf(['a', 'b>a', 'x>b', 'c>x'])
    const visibleIds = new Set(['a', 'c'])
    const collapsible = new Set(['b', 'x'])
    const node = tree.byId.get('b')
    expect(node).toBeDefined()
    const eff = effectiveVisibleChildren(node!, visibleIds, collapsible)
    expect(eff.map(n => n.task.id)).toEqual(['c'])
  })

  it('旁枝剪除：B 塌陷，子 C 可见、X 不可见 → 有效子 = [C]', () => {
    const tree = treeOf(['a', 'b>a', 'c>b', 'x>b'])
    const visibleIds = new Set(['a', 'c']) // X 不在 visibleIds
    const collapsible = new Set(['b'])
    const node = tree.byId.get('b')
    expect(node).toBeDefined()
    const eff = effectiveVisibleChildren(node!, visibleIds, collapsible)
    expect(eff.map(n => n.task.id)).toEqual(['c'])
  })

  it('多子上浮：B 塌陷，C/E 均 matched → 有效子 = [C,E]', () => {
    const tree = treeOf(['a', 'b>a', 'c>b', 'e>b'])
    const visibleIds = new Set(['a', 'c', 'e'])
    const collapsible = new Set(['b'])
    const node = tree.byId.get('b')
    expect(node).toBeDefined()
    const eff = effectiveVisibleChildren(node!, visibleIds, collapsible)
    expect(eff.map(n => n.task.id).sort()).toEqual(['c', 'e'])
  })
})
