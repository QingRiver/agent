import { describe, expect, it } from 'vitest'
import { assertKindInvariant, makeDir, ProjectDirError, renameDir } from './dir'

const NOW = '2026-08-06T00:00:00.000Z'

describe('assertKindInvariant', () => {
  it('project 根合法', () => {
    expect(() => assertKindInvariant({ kind: 'project', parentId: null })).not.toThrow()
  })

  it('project 有 parent → throw', () => {
    expect(() => assertKindInvariant({ kind: 'project', parentId: 'd1' })).toThrow(ProjectDirError)
  })

  it('dir 有 parent 合法', () => {
    expect(() => assertKindInvariant({ kind: 'dir', parentId: 'p1' })).not.toThrow()
  })

  it('dir 无 parent → throw', () => {
    expect(() => assertKindInvariant({ kind: 'dir', parentId: null })).toThrow(ProjectDirError)
  })
})

describe('makeDir', () => {
  it('project 根：projectId=自身, vdir=name', () => {
    const p = makeDir({ id: 'p1', parentId: null, kind: 'project', name: 'Proj', ownerId: 'u', now: NOW })
    expect(p.projectId).toBe('p1')
    expect(p.vdir).toBe('Proj')
    expect(p.etag).toBe(1)
    expect(p.deleted).toBe(false)
  })

  it('dir：projectId/vdir 由父派生', () => {
    const p = makeDir({ id: 'p1', parentId: null, kind: 'project', name: 'Proj', ownerId: 'u', now: NOW })
    const d = makeDir({ id: 'd1', parentId: 'p1', kind: 'dir', name: 'a', ownerId: 'u', now: NOW, projectId: 'p1', parentVdir: p.vdir })
    expect(d.projectId).toBe('p1')
    expect(d.vdir).toBe('Proj/a')
  })

  it('dir 无 projectId → throw', () => {
    expect(() => makeDir({ id: 'd1', parentId: 'p1', kind: 'dir', name: 'a', ownerId: 'u', now: NOW })).toThrow(ProjectDirError)
  })
})

describe('renameDir', () => {
  it('dir：name/vdir 变，结构不变（parentId/projectId）', () => {
    const p = makeDir({ id: 'p1', parentId: null, kind: 'project', name: 'Proj', ownerId: 'u', now: NOW })
    const d = makeDir({ id: 'd1', parentId: 'p1', kind: 'dir', name: 'a', ownerId: 'u', now: NOW, projectId: 'p1', parentVdir: p.vdir })
    const renamed = renameDir(d, 'A2', NOW)
    expect(renamed.name).toBe('A2')
    expect(renamed.vdir).toBe('Proj/A2')
    expect(renamed.parentId).toBe(d.parentId) // 结构不变
    expect(renamed.projectId).toBe(d.projectId) // 结构不变
    expect(renamed.etag).toBe(d.etag + 1)
  })

  it('project 根：vdir=name', () => {
    const p = makeDir({ id: 'p1', parentId: null, kind: 'project', name: 'Proj', ownerId: 'u', now: NOW })
    const renamed = renameDir(p, 'P2', NOW)
    expect(renamed.vdir).toBe('P2')
    expect(renamed.projectId).toBe('p1')
  })
})
