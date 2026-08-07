import { describe, expect, it } from 'vitest'
import { canTraverse, hasPermission } from './acl'
import { makeDir } from './dir'

const NOW = '2026-08-06T00:00:00.000Z'

describe('hasPermission', () => {
  it('有权限 → true', () => {
    expect(hasPermission({ u1: { traverse: true, read: false, write: false, admin: false } }, 'u1', 'traverse')).toBe(true)
  })

  it('无权限 → false', () => {
    expect(hasPermission({ u1: { traverse: true, read: false, write: false, admin: false } }, 'u1', 'write')).toBe(false)
  })

  it('用户不存在 → false', () => {
    expect(hasPermission({}, 'u2', 'read')).toBe(false)
  })
})

describe('canTraverse', () => {
  const owner = 'u1'
  const other = 'u2'
  const p = makeDir({ id: 'p1', parentId: null, kind: 'project', name: 'P', ownerId: owner, now: NOW })
  const d = makeDir({ id: 'd1', parentId: 'p1', kind: 'dir', name: 'a', ownerId: owner, now: NOW, projectId: 'p1', parentVdir: p.vdir })

  it('owner 恒过全链', () => {
    expect(canTraverse([p, d], owner)).toBe(true)
  })

  it('非 owner 且无 traverse → false', () => {
    expect(canTraverse([p, d], other)).toBe(false)
  })

  it('非 owner 全链有 traverse → true', () => {
    const pGrant = { ...p, acl: { [other]: { traverse: true, read: false, write: false, admin: false } } }
    const dGrant = { ...d, acl: { [other]: { traverse: true, read: false, write: false, admin: false } } }
    expect(canTraverse([pGrant, dGrant], other)).toBe(true)
  })

  it('链中任一节点缺 traverse → false', () => {
    const pGrant = { ...p, acl: { [other]: { traverse: true, read: false, write: false, admin: false } } }
    // d 无 grant
    expect(canTraverse([pGrant, d], other)).toBe(false)
  })
})
