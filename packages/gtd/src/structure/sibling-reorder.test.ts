import { describe, expect, it } from 'vitest'
import { makeTaskRow } from '../fixtures'
import { fullyVisibleSiblingReorderIds, taskSiblingKey } from './sibling-reorder'

describe('taskSiblingKey', () => {
  it('根任务按 mountDirId 分桶', () => {
    expect(taskSiblingKey({ mountDirId: null, parentId: null })).toBe('\0')
    expect(taskSiblingKey({ mountDirId: 'p1', parentId: null })).toBe('p1\0')
  })

  it('子任务带 parentId', () => {
    expect(taskSiblingKey({ mountDirId: 'p1', parentId: 'a' })).toBe('p1\0a')
  })
})

describe('fullyVisibleSiblingReorderIds', () => {
  const a = makeTaskRow('a', { mountDirId: 'p1', parentId: null, order: 0 })
  const b = makeTaskRow('b', { mountDirId: 'p1', parentId: null, order: 1 })
  const c = makeTaskRow('c', { mountDirId: 'p1', parentId: null, order: 2 })

  it('整组可见且 ≥2 → 全部可拖', () => {
    const ids = fullyVisibleSiblingReorderIds(['a', 'b', 'c'], [a, b, c])
    expect([...ids].sort()).toEqual(['a', 'b', 'c'])
  })

  it('缺员不可见 → 整组不可拖（避免 A/C 对拖跳过 B）', () => {
    const ids = fullyVisibleSiblingReorderIds(['a', 'c'], [a, b, c])
    expect(ids.size).toBe(0)
  })

  it('单成员组不可拖', () => {
    const alone = makeTaskRow('x', { mountDirId: 'p2', parentId: null, order: 0 })
    const ids = fullyVisibleSiblingReorderIds(['x'], [alone])
    expect(ids.size).toBe(0)
  })

  it('不同兄弟组互不影响', () => {
    const child1 = makeTaskRow('c1', { mountDirId: 'p1', parentId: 'a', order: 0 })
    const child2 = makeTaskRow('c2', { mountDirId: 'p1', parentId: 'a', order: 1 })
    // 根 a/b/c 未全在可见集 → 根组不可拖；子 c1/c2 整组可见可拖
    const ids = fullyVisibleSiblingReorderIds(
      ['a', 'b', 'c1', 'c2'],
      [a, b, c, child1, child2],
    )
    expect([...ids].sort()).toEqual(['c1', 'c2'])
  })

  it('不同项目的根不同组', () => {
    const p2a = makeTaskRow('p2a', { mountDirId: 'p2', parentId: null, order: 0 })
    const p2b = makeTaskRow('p2b', { mountDirId: 'p2', parentId: null, order: 1 })
    const ids = fullyVisibleSiblingReorderIds(
      ['a', 'b', 'c', 'p2a', 'p2b'],
      [a, b, c, p2a, p2b],
    )
    expect([...ids].sort()).toEqual(['a', 'b', 'c', 'p2a', 'p2b'])
  })
})
