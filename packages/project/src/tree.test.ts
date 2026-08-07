import type { DirRow } from './schema'
import { describe, expect, it } from 'vitest'
import { makeDir, ProjectDirError } from './dir'
import {
  assertCanDelete,
  assertMoveValid,
  buildDirTree,
  isAncestorOrSelf,
  movedProjectId,
  subtreeDirIds,
  subtreeHeight,
  walkToProjectRoot,
} from './tree'

const NOW = '2026-08-06T00:00:00.000Z'

/** 建一条 p1 > d1 > d2 > ... > dN 的链 */
function chain(n: number): DirRow[] {
  const p = makeDir({ id: 'p1', parentId: null, kind: 'project', name: 'Proj', ownerId: 'u', now: NOW })
  const rows: DirRow[] = [p]
  let parent = p
  for (let i = 1; i <= n; i++) {
    const d = makeDir({ id: `d${i}`, parentId: parent.id, kind: 'dir', name: `l${i}`, ownerId: 'u', now: NOW, projectId: 'p1', parentVdir: parent.vdir })
    rows.push(d)
    parent = d
  }
  return rows
}

describe('buildDirTree', () => {
  it('扁平 → 树 + byId', () => {
    const rows = chain(3)
    const tree = buildDirTree(rows)
    expect(tree.roots).toHaveLength(1)
    expect(tree.roots[0]!.dir.id).toBe('p1')
    expect(tree.roots[0]!.children[0]!.children[0]!.children[0]!.dir.id).toBe('d3')
  })

  it('depth：project 根 0，每层 +1', () => {
    const rows = chain(3)
    const tree = buildDirTree(rows)
    expect(tree.byId.get('p1')!.depth).toBe(0)
    expect(tree.byId.get('d1')!.depth).toBe(1)
    expect(tree.byId.get('d3')!.depth).toBe(3)
  })
})

describe('subtreeHeight', () => {
  it('叶子 = 1', () => {
    const tree = buildDirTree(chain(1))
    expect(subtreeHeight(tree.byId.get('d1')!)).toBe(1)
  })

  it('含子树 = 1 + max', () => {
    const tree = buildDirTree(chain(3))
    expect(subtreeHeight(tree.byId.get('p1')!)).toBe(4)
    expect(subtreeHeight(tree.byId.get('d1')!)).toBe(3)
  })
})

describe('isAncestorOrSelf', () => {
  it('自身', () => {
    const tree = buildDirTree(chain(2))
    expect(isAncestorOrSelf('d1', 'd1', tree.byId)).toBe(true)
  })

  it('祖先', () => {
    const tree = buildDirTree(chain(3))
    expect(isAncestorOrSelf('p1', 'd3', tree.byId)).toBe(true)
    expect(isAncestorOrSelf('d1', 'd3', tree.byId)).toBe(true)
  })

  it('非祖先', () => {
    const tree = buildDirTree(chain(3))
    expect(isAncestorOrSelf('d3', 'd1', tree.byId)).toBe(false)
  })
})

describe('walkToProjectRoot', () => {
  it('project 自身', () => {
    const rows = chain(2)
    const byId = new Map(rows.map(r => [r.id, r]))
    expect(walkToProjectRoot('p1', byId)).toBe('p1')
  })

  it('dir 沿链到 project', () => {
    const rows = chain(2)
    const byId = new Map(rows.map(r => [r.id, r]))
    expect(walkToProjectRoot('d2', byId)).toBe('p1')
  })

  it('null dirId → null', () => {
    expect(walkToProjectRoot(null, new Map())).toBeNull()
  })

  it('链断裂 → null', () => {
    expect(walkToProjectRoot('not-exist', new Map())).toBeNull()
  })
})

describe('assertMoveValid', () => {
  it('project 不可移动', () => {
    const rows = chain(1)
    const tree = buildDirTree(rows)
    expect(() => assertMoveValid(rows[0]!, rows[1]!, tree, [])).toThrow(ProjectDirError)
  })

  it('dir 不可移成根', () => {
    const tree = buildDirTree(chain(1))
    expect(() => assertMoveValid(tree.byId.get('d1')!.dir, null, tree, [])).toThrow(ProjectDirError)
  })

  it('防环：移入自身', () => {
    const tree = buildDirTree(chain(1))
    const d1 = tree.byId.get('d1')!.dir
    expect(() => assertMoveValid(d1, d1, tree, [])).toThrow(ProjectDirError)
  })

  it('防环：移入自身后代', () => {
    const tree = buildDirTree(chain(3)) // p1 > d1 > d2 > d3
    const d1 = tree.byId.get('d1')!.dir
    const d3 = tree.byId.get('d3')!.dir
    expect(() => assertMoveValid(d1, d3, tree, [])).toThrow(ProjectDirError)
  })

  it('5 层上限：移到 depth=5 节点下 → throw', () => {
    const rows = chain(5) // d5 depth=5
    const x = makeDir({ id: 'x', parentId: 'p1', kind: 'dir', name: 'x', ownerId: 'u', now: NOW, projectId: 'p1', parentVdir: rows[0]!.vdir })
    const tree = buildDirTree([...rows, x])
    expect(() => assertMoveValid(x, rows[5]!, tree, [])).toThrow(/5 层/)
  })

  it('合法深度：移到 depth=3 节点下 → 通过', () => {
    const rows = chain(3) // d3 depth=3
    const x = makeDir({ id: 'x', parentId: 'p1', kind: 'dir', name: 'x', ownerId: 'u', now: NOW, projectId: 'p1', parentVdir: rows[0]!.vdir })
    const tree = buildDirTree([...rows, x])
    expect(() => assertMoveValid(x, rows[3]!, tree, [])).not.toThrow()
  })

  it('同级名唯一：新父下已有同名 → throw', () => {
    const rows = chain(2) // p1 > d1(l1) > d2(l2)
    const tree = buildDirTree(rows)
    const d2 = rows[2]!
    expect(() => assertMoveValid(d2, rows[0]!, tree, ['l1'])).not.toThrow()
    const d2dup = { ...d2, name: 'l1' }
    expect(() => assertMoveValid(d2dup, rows[0]!, tree, ['l1'])).toThrow(ProjectDirError)
  })
})

describe('assertCanDelete', () => {
  it('空 → 通过', () => {
    expect(() => assertCanDelete(false, false)).not.toThrow()
  })

  it('有子 / 有挂载 → throw', () => {
    expect(() => assertCanDelete(true, false)).toThrow(ProjectDirError)
    expect(() => assertCanDelete(false, true)).toThrow(ProjectDirError)
  })
})

describe('movedProjectId', () => {
  it('跨 project → newRoot', () => {
    expect(movedProjectId('p1', 'p2')).toBe('p2')
  })

  it('同 project → null（不动）', () => {
    expect(movedProjectId('p1', 'p1')).toBeNull()
  })
})

describe('subtreeDirIds', () => {
  // 分支树：p1 > d1 > d2,  p1 > d1 > d3,  p1 > d4
  function branchTree(): DirRow[] {
    const p1 = makeDir({ id: 'p1', parentId: null, kind: 'project', name: 'Proj', ownerId: 'u', now: NOW })
    const d1 = makeDir({ id: 'd1', parentId: 'p1', kind: 'dir', name: 'a', ownerId: 'u', now: NOW, projectId: 'p1', parentVdir: p1.vdir })
    const d2 = makeDir({ id: 'd2', parentId: 'd1', kind: 'dir', name: 'b', ownerId: 'u', now: NOW, projectId: 'p1', parentVdir: d1.vdir })
    const d3 = makeDir({ id: 'd3', parentId: 'd1', kind: 'dir', name: 'c', ownerId: 'u', now: NOW, projectId: 'p1', parentVdir: d1.vdir })
    const d4 = makeDir({ id: 'd4', parentId: 'p1', kind: 'dir', name: 'd', ownerId: 'u', now: NOW, projectId: 'p1', parentVdir: p1.vdir })
    return [p1, d1, d2, d3, d4]
  }

  it('含自身 + 全部后代（跨分支）', () => {
    const tree = buildDirTree(branchTree())
    expect(subtreeDirIds(tree, 'd1')).toEqual(new Set(['d1', 'd2', 'd3']))
  })

  it('整棵 project 树', () => {
    const tree = buildDirTree(branchTree())
    expect(subtreeDirIds(tree, 'p1')).toEqual(new Set(['p1', 'd1', 'd2', 'd3', 'd4']))
  })

  it('叶子子树 = {自身}', () => {
    const tree = buildDirTree(branchTree())
    expect(subtreeDirIds(tree, 'd2')).toEqual(new Set(['d2']))
  })

  it('rootDirId 不在树内 → 空 Set', () => {
    const tree = buildDirTree(branchTree())
    expect(subtreeDirIds(tree, 'not-exist')).toEqual(new Set())
  })
})
