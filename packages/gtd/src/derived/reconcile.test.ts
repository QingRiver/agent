import type { EntityRow } from '../data/sync-schema'
import { describe, expect, it } from 'vitest'
import { RowStore } from '../data/rows'
import { EXPLICIT_STATUS, GROUP_TYPE } from '../data/types'
import { makeTaskRow } from '../fixtures'
import { validateInvariants } from './invariant'
import { reconcile } from './reconcile'

const TS = '2026-08-14T00:00:00.000Z'

/** 递增 syncId 计数器（reconcile 盖戳用）。 */
function counter(start: number): () => number {
  let n = start
  return () => {
    n += 1
    return n
  }
}

function taskOf(rows: EntityRow[], id: string) {
  const r = rows.find(r => r.entity === 'task' && r.id === id)
  if (!r || r.entity !== 'task')
    throw new Error(`task ${id} not found`)
  return r
}

describe('reconcile — completed_with_active_child 防御兜底', () => {
  it('无违法态：不改行、返回空', () => {
    const p = makeTaskRow('p', { mountDirId: 'd1', groupType: GROUP_TYPE.PARALLEL })
    const c = makeTaskRow('c', { parentId: 'p', mountDirId: 'd1' })
    const rows = [p, c]
    const before = rows.map(r => ({ ...r, data: { ...r.data } }))
    const res = reconcile(rows, TS, counter(100))
    expect(res.reactivated).toEqual([])
    expect(rows).toEqual(before)
  })

  it('父完成时子的有效状态跟随父：完成父 + 活跃子不违法 → reconcile 不翻（有效状态已保证合法）', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED, completedAt: TS, mountDirId: 'd1', groupType: GROUP_TYPE.PARALLEL })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE, mountDirId: 'd1' })
    const rows = [p, c]
    // 父完成时子的有效状态跟随父：c 有效变完成（非活跃）→ 无 completed_with_active_child 违法
    expect(validateInvariants(new RowStore(rows)).some(v => v.code === 'completed_with_active_child')).toBe(false)

    const res = reconcile(rows, TS, counter(100))

    // 不违法 → reconcile 不翻父，状态不变
    expect(res.reactivated).toEqual([])
    expect(taskOf(rows, 'p').data.status).toBe(EXPLICIT_STATUS.COMPLETED)
    expect(taskOf(rows, 'c').data.status).toBe(EXPLICIT_STATUS.ACTIVE)
  })

  it('父完成时子的有效状态跟随父：多级完成链 + 活跃孙不违法 → reconcile 不翻', () => {
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.COMPLETED, completedAt: TS, mountDirId: 'd1', groupType: GROUP_TYPE.PARALLEL })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.COMPLETED, completedAt: TS, mountDirId: 'd1', groupType: GROUP_TYPE.PARALLEL })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE, mountDirId: 'd1' })
    const rows = [gp, p, c]
    // 父完成时子的有效状态跟随父：c 有效变完成（祖先链 gp/p 完成）→ 无违法
    expect(validateInvariants(new RowStore(rows)).some(v => v.code === 'completed_with_active_child')).toBe(false)

    const res = reconcile(rows, TS, counter(200))

    expect(res.reactivated).toEqual([])
    expect(taskOf(rows, 'gp').data.status).toBe(EXPLICIT_STATUS.COMPLETED)
    expect(taskOf(rows, 'p').data.status).toBe(EXPLICIT_STATUS.COMPLETED)
    expect(taskOf(rows, 'c').data.status).toBe(EXPLICIT_STATUS.ACTIVE)
  })

  it('父完成时子的有效状态跟随父：完成父→搁置子→活跃孙 → 孙有效变完成非活跃 → 不违法不触发拉回', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED, completedAt: TS, mountDirId: 'd1', groupType: GROUP_TYPE.PARALLEL })
    const m = makeTaskRow('m', { parentId: 'p', status: EXPLICIT_STATUS.HOLD, heldAt: TS, mountDirId: 'd1', groupType: GROUP_TYPE.PARALLEL })
    const c = makeTaskRow('c', { parentId: 'm', status: EXPLICIT_STATUS.ACTIVE, mountDirId: 'd1' })
    const rows = [p, m, c]
    // c 的有效状态跟随根 p 完成 → c 有效变完成（非活跃）→ 无 completed_with_active_child 违法
    expect(validateInvariants(new RowStore(rows)).some(v => v.code === 'completed_with_active_child')).toBe(false)

    const res = reconcile(rows, TS, counter(300))

    expect(res.reactivated).toEqual([])
    expect(taskOf(rows, 'p').data.status).toBe(EXPLICIT_STATUS.COMPLETED)
    expect(taskOf(rows, 'm').data.status).toBe(EXPLICIT_STATUS.HOLD)
    expect(taskOf(rows, 'c').data.status).toBe(EXPLICIT_STATUS.ACTIVE)
  })

  it('幂等：连跑两次第二次返回空且不改行', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED, completedAt: TS, mountDirId: 'd1', groupType: GROUP_TYPE.PARALLEL })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE, mountDirId: 'd1' })
    const rows = [p, c]
    reconcile(rows, TS, counter(400))
    const snapshot = rows.map(r => ({ ...r, data: { ...r.data } }))

    const res2 = reconcile(rows, TS, counter(500))

    expect(res2.reactivated).toEqual([])
    expect(rows).toEqual(snapshot)
  })

  it('父完成时子的有效状态跟随父：并列两组完成父 + 活跃子均不违法 → reconcile 不翻', () => {
    const p1 = makeTaskRow('p1', { status: EXPLICIT_STATUS.COMPLETED, completedAt: TS, mountDirId: 'd1', groupType: GROUP_TYPE.PARALLEL })
    const c1 = makeTaskRow('c1', { parentId: 'p1', status: EXPLICIT_STATUS.ACTIVE, mountDirId: 'd1' })
    const p2 = makeTaskRow('p2', { status: EXPLICIT_STATUS.COMPLETED, completedAt: TS, mountDirId: 'd2', groupType: GROUP_TYPE.PARALLEL })
    const c2 = makeTaskRow('c2', { parentId: 'p2', status: EXPLICIT_STATUS.ACTIVE, mountDirId: 'd2' })
    const rows = [p1, c1, p2, c2]
    // 父完成时子的有效状态跟随父：c1/c2 有效变完成 → 两组均无违法
    expect(validateInvariants(new RowStore(rows)).some(v => v.code === 'completed_with_active_child')).toBe(false)

    const res = reconcile(rows, TS, counter(600))

    expect(res.reactivated).toEqual([])
    expect(taskOf(rows, 'p1').data.status).toBe(EXPLICIT_STATUS.COMPLETED)
    expect(taskOf(rows, 'p2').data.status).toBe(EXPLICIT_STATUS.COMPLETED)
  })
})
