import { describe, expect, it } from 'vitest'
import { makeTaskRow } from '../fixtures'
import { ancestors, buildTaskTree, children } from './tree'

describe('buildTaskTree', () => {
  it('顶层 action 作为 roots', () => {
    const t1 = makeTaskRow('a', { parentId: null, order: 1 })
    const t2 = makeTaskRow('b', { parentId: null, order: 2 })
    const tree = buildTaskTree([t1, t2])
    expect(tree.roots.map(n => n.task.id)).toEqual(['a', 'b'])
  })

  it('parentId 指向的 task 作为子节点', () => {
    const parent = makeTaskRow('a', { parentId: null, groupType: 'parallel' })
    const child = makeTaskRow('b', { parentId: 'a' })
    const tree = buildTaskTree([parent, child])
    expect(tree.byId.get('a')?.children.map(n => n.task.id)).toEqual(['b'])
    expect(tree.byId.get('b')?.parent?.task.id).toBe('a')
  })

  it('byId 索引所有 task', () => {
    const t = makeTaskRow('a')
    expect(buildTaskTree([t]).byId.get('a')?.task.id).toBe('a')
  })
})

describe('buildTaskTree 读时修复', () => {
  it('parentId 指向自身视为根', () => {
    const tree = buildTaskTree([makeTaskRow('a', { parentId: 'a' })])
    expect(tree.roots.map(n => n.task.id)).toEqual(['a'])
  })

  it('parentId 指向不存在的任务视为根', () => {
    const tree = buildTaskTree([makeTaskRow('a', { parentId: 'gone' })])
    expect(tree.roots.map(n => n.task.id)).toEqual(['a'])
    expect(tree.byId.get('a')?.parent).toBeNull()
  })

  it('两节点环：syncId 较大（后写入）的成为根', () => {
    const x = makeTaskRow('x', { parentId: 'y' }, { syncId: 5 })
    const y = makeTaskRow('y', { parentId: 'x' }, { syncId: 9 })
    const tree = buildTaskTree([x, y])
    expect(tree.roots.map(n => n.task.id)).toEqual(['y'])
    expect(ancestors(tree, 'x').map(t => t.id)).toEqual(['y'])
  })

  it('同 syncId 时 id 较大者成为根，与输入顺序无关', () => {
    const a = makeTaskRow('a', { parentId: 'b' }, { syncId: 1 })
    const b = makeTaskRow('b', { parentId: 'a' }, { syncId: 1 })
    expect(buildTaskTree([a, b]).roots.map(n => n.task.id)).toEqual(['b'])
    expect(buildTaskTree([b, a]).roots.map(n => n.task.id)).toEqual(['b'])
  })

  it('长环挂着尾巴：只断开环上一个节点，其余结构保留', () => {
    const rows = [
      makeTaskRow('a', { parentId: 'd' }, { syncId: 1 }),
      makeTaskRow('b', { parentId: 'a' }, { syncId: 2 }),
      makeTaskRow('c', { parentId: 'b' }, { syncId: 7 }),
      makeTaskRow('d', { parentId: 'c' }, { syncId: 3 }),
      makeTaskRow('tail', { parentId: 'b' }, { syncId: 99 }),
    ]
    const tree = buildTaskTree(rows)
    expect(tree.roots.map(n => n.task.id)).toEqual(['c'])
    expect(ancestors(tree, 'tail').map(t => t.id)).toEqual(['b', 'a', 'd', 'c'])
  })

  it('多个独立的环各自断开', () => {
    const rows = [
      makeTaskRow('a', { parentId: 'b' }, { syncId: 2 }),
      makeTaskRow('b', { parentId: 'a' }, { syncId: 1 }),
      makeTaskRow('c', { parentId: 'd' }, { syncId: 1 }),
      makeTaskRow('d', { parentId: 'c' }, { syncId: 2 }),
    ]
    expect(buildTaskTree(rows).roots.map(n => n.task.id).sort()).toEqual(['a', 'd'])
  })
})

describe('ancestors', () => {
  it('返回从父到根的祖先链', () => {
    const root = makeTaskRow('r', { parentId: null })
    const mid = makeTaskRow('m', { parentId: 'r' })
    const leaf = makeTaskRow('l', { parentId: 'm' })
    const tree = buildTaskTree([root, mid, leaf])
    expect(ancestors(tree, 'l').map(t => t.id)).toEqual(['m', 'r'])
  })
})

describe('children', () => {
  it('返回直接子 task', () => {
    const parent = makeTaskRow('a', { groupType: 'parallel' })
    const c1 = makeTaskRow('b', { parentId: 'a', order: 2 })
    const c2 = makeTaskRow('c', { parentId: 'a', order: 1 })
    const tree = buildTaskTree([parent, c1, c2])
    expect(children(tree, 'a').map(t => t.id)).toEqual(['c', 'b'])
  })
})
