import { describe, expect, it } from 'vitest'
import { makeDir } from './dir'
import { dirVdir, recomputeSubtreeVdirs } from './vdir'

const NOW = '2026-08-06T00:00:00.000Z'

describe('dirVdir', () => {
  it('project 根（parentVdir null）→ name', () => {
    expect(dirVdir(null, 'root')).toBe('root')
  })

  it('dir → parentVdir/name', () => {
    expect(dirVdir('a/b', 'c')).toBe('a/b/c')
  })

  it('空 parentVdir 字符串也走拼接分支（仅 null 为根）', () => {
    expect(dirVdir('', 'c')).toBe('/c')
  })
})

describe('recomputeSubtreeVdirs', () => {
  const project = makeDir({ id: 'p1', parentId: null, kind: 'project', name: 'Proj', ownerId: 'u', now: NOW })
  const d1 = makeDir({ id: 'd1', parentId: 'p1', kind: 'dir', name: 'a', ownerId: 'u', now: NOW, projectId: 'p1', parentVdir: project.vdir })
  const d2 = makeDir({ id: 'd2', parentId: 'd1', kind: 'dir', name: 'b', ownerId: 'u', now: NOW, projectId: 'p1', parentVdir: d1.vdir })

  it('rename 后子树 vdir 全重算（根 name 已改）', () => {
    const renamedRoot = { ...d1, name: 'A2' }
    const result = recomputeSubtreeVdirs([renamedRoot, d2], project.vdir)
    expect(result.get('d1')).toBe('Proj/A2')
    expect(result.get('d2')).toBe('Proj/A2/b')
  })

  it('move 后子树 vdir 接到新父 vdir', () => {
    const result = recomputeSubtreeVdirs([d1, d2], 'NewProj')
    expect(result.get('d1')).toBe('NewProj/a')
    expect(result.get('d2')).toBe('NewProj/a/b')
  })
})
