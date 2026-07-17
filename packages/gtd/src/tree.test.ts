import { describe, expect, it } from 'vitest'
import { makeTask } from './__tests__/fixtures'
import { ancestors, buildTaskTree, children, nearestAncestor, rootTasksOfProject } from './tree'

describe('buildTaskTree', () => {
  it('顶层 action 作为 roots', () => {
    const t1 = makeTask({ id: 'a', projectId: 'p', parentId: null, order: 1 })
    const t2 = makeTask({ id: 'b', projectId: 'p', parentId: null, order: 2 })
    const tree = buildTaskTree([t1, t2])
    expect(tree.roots.map(n => n.task.id)).toEqual(['a', 'b'])
  })

  it('parentId 指向的 task 作为子节点', () => {
    const parent = makeTask({ id: 'a', projectId: 'p', parentId: null, groupType: 'parallel' })
    const child = makeTask({ id: 'b', projectId: 'p', parentId: 'a' })
    const tree = buildTaskTree([parent, child])
    expect(tree.byId.get('a')?.children.map(n => n.task.id)).toEqual(['b'])
    expect(tree.byId.get('b')?.parent?.task.id).toBe('a')
  })

  it('byId 索引所有 task', () => {
    const t = makeTask({ id: 'a' })
    expect(buildTaskTree([t]).byId.get('a')?.task.id).toBe('a')
  })
})

describe('ancestors', () => {
  it('返回从父到根的祖先链', () => {
    const root = makeTask({ id: 'r', parentId: null })
    const mid = makeTask({ id: 'm', parentId: 'r' })
    const leaf = makeTask({ id: 'l', parentId: 'm' })
    const tree = buildTaskTree([root, mid, leaf])
    expect(ancestors(tree, 'l').map(t => t.id)).toEqual(['m', 'r'])
  })
})

describe('children', () => {
  it('返回直接子 task', () => {
    const parent = makeTask({ id: 'a', groupType: 'parallel' })
    const c1 = makeTask({ id: 'b', parentId: 'a', order: 2 })
    const c2 = makeTask({ id: 'c', parentId: 'a', order: 1 })
    const tree = buildTaskTree([parent, c1, c2])
    expect(children(tree, 'a').map(t => t.id)).toEqual(['c', 'b'])
  })
})

describe('nearestAncestor', () => {
  it('返回最近满足 predicate 的祖先', () => {
    const root = makeTask({ id: 'r', groupType: 'sequential' })
    const mid = makeTask({ id: 'm', parentId: 'r', groupType: 'parallel' })
    const leaf = makeTask({ id: 'l', parentId: 'm' })
    const tree = buildTaskTree([root, mid, leaf])
    const seq = nearestAncestor(tree, 'l', t => t.groupType === 'sequential')
    expect(seq?.id).toBe('r')
  })

  it('无满足者返回 null', () => {
    const leaf = makeTask({ id: 'l' })
    const tree = buildTaskTree([leaf])
    expect(nearestAncestor(tree, 'l', () => false)).toBeNull()
  })
})

describe('rootTasksOfProject', () => {
  it('返回 project 下 parentId 为 null 的顶层 action，按 order 排序', () => {
    const t1 = makeTask({ id: 'a', projectId: 'p', order: 2 })
    const t2 = makeTask({ id: 'b', projectId: 'p', order: 1 })
    const sub = makeTask({ id: 'c', projectId: 'p', parentId: 'a' })
    const other = makeTask({ id: 'd', projectId: 'q' })
    expect(rootTasksOfProject([t1, t2, sub, other], 'p').map(t => t.id)).toEqual(['b', 'a'])
  })
})
