import { describe, expect, it } from 'vitest'
import { makeTaskRow } from './__tests__/sync-fixtures'
import { ancestors, buildTaskTree, children, nearestAncestor, rootTasksOfProject } from './tree'

describe('buildTaskTree', () => {
  it('顶层 action 作为 roots', () => {
    const t1 = makeTaskRow('a', { projectId: 'p', parentId: null, order: 1 })
    const t2 = makeTaskRow('b', { projectId: 'p', parentId: null, order: 2 })
    const tree = buildTaskTree([t1, t2])
    expect(tree.roots.map(n => n.task.id)).toEqual(['a', 'b'])
  })

  it('parentId 指向的 task 作为子节点', () => {
    const parent = makeTaskRow('a', { projectId: 'p', parentId: null, groupType: 'parallel' })
    const child = makeTaskRow('b', { projectId: 'p', parentId: 'a' })
    const tree = buildTaskTree([parent, child])
    expect(tree.byId.get('a')?.children.map(n => n.task.id)).toEqual(['b'])
    expect(tree.byId.get('b')?.parent?.task.id).toBe('a')
  })

  it('byId 索引所有 task', () => {
    const t = makeTaskRow('a')
    expect(buildTaskTree([t]).byId.get('a')?.task.id).toBe('a')
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

describe('nearestAncestor', () => {
  it('返回最近满足 predicate 的祖先', () => {
    const root = makeTaskRow('r', { groupType: 'sequential' })
    const mid = makeTaskRow('m', { parentId: 'r', groupType: 'parallel' })
    const leaf = makeTaskRow('l', { parentId: 'm' })
    const tree = buildTaskTree([root, mid, leaf])
    const seq = nearestAncestor(tree, 'l', t => t.data.groupType === 'sequential')
    expect(seq?.id).toBe('r')
  })

  it('无满足者返回 null', () => {
    const leaf = makeTaskRow('l')
    const tree = buildTaskTree([leaf])
    expect(nearestAncestor(tree, 'l', () => false)).toBeNull()
  })
})

describe('rootTasksOfProject', () => {
  it('返回 project 下 parentId 为 null 的顶层 action，按 order 排序', () => {
    const t1 = makeTaskRow('a', { projectId: 'p', order: 2 })
    const t2 = makeTaskRow('b', { projectId: 'p', order: 1 })
    const sub = makeTaskRow('c', { projectId: 'p', parentId: 'a' })
    const other = makeTaskRow('d', { projectId: 'q' })
    expect(rootTasksOfProject([t1, t2, sub, other], 'p').map(t => t.id)).toEqual(['b', 'a'])
  })
})
