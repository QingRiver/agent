import { describe, expect, it } from 'vitest'
import { RowStore } from '../data/rows'
import { EXPLICIT_STATUS, GROUP_TYPE, PLANNED_MODE } from '../data/types'
import { makeTaskRow, makeTaskTagRow } from '../fixtures'
import { validateInvariants } from './invariant'

describe('validateInvariants', () => {
  it('合法 rows 返回空数组', () => {
    const t = makeTaskRow('t1', { mountDirId: 'd1' })
    expect(validateInvariants(new RowStore([t]))).toEqual([])
  })

  it('missing_terminal_timestamp: completed 无 completedAt', () => {
    const t = makeTaskRow('t1', { status: EXPLICIT_STATUS.COMPLETED, completedAt: null })
    expect(validateInvariants(new RowStore([t])).some(v => v.code === 'missing_terminal_timestamp')).toBe(true)
  })

  it('cycle: parentId 成环', () => {
    const a = makeTaskRow('a', { parentId: 'b', mountDirId: 'd1' })
    const b = makeTaskRow('b', { parentId: 'a', mountDirId: 'd1' })
    expect(validateInvariants(new RowStore([a, b])).some(v => v.code === 'cycle')).toBe(true)
  })

  it('task_tag 不因 RowStore 无 tag 目录行而报悬空（目录已退出 sync）', () => {
    const t = makeTaskRow('t1')
    const tt = makeTaskTagRow('t1', 'external-tag')
    expect(validateInvariants(new RowStore([t, tt]))).toEqual([])
  })

  it('broken_reference: attachment taskId 悬空', () => {
    const a = {
      entity: 'attachment' as const,
      id: 'a1',
      userId: 'u1',
      syncId: 1,
      deleted: false,
      data: {
        taskId: 'missing-task',
        kind: 'file' as const,
        url: 'https://x',
        filename: 'f',
        createdAt: new Date().toISOString(),
      },
    }
    expect(validateInvariants(new RowStore([a])).some(v => v.code === 'broken_reference')).toBe(true)
  })

  it('duplicate_order: 不同 mountDirId 同 order 不冲突', () => {
    const a = makeTaskRow('a', { mountDirId: 'd1', order: 1 })
    const b = makeTaskRow('b', { mountDirId: 'd2', order: 1 })
    expect(validateInvariants(new RowStore([a, b]))).toEqual([])
  })

  it('duplicate_order: 同 mountDirId 同 order 冲突', () => {
    const a = makeTaskRow('a', { mountDirId: 'd1', order: 1 })
    const b = makeTaskRow('b', { mountDirId: 'd1', order: 1 })
    expect(validateInvariants(new RowStore([a, b])).some(v => v.code === 'duplicate_order')).toBe(true)
  })

  it('invalid_inbox: 有 parent 但无 mountDirId', () => {
    const parent = makeTaskRow('p', { mountDirId: 'd1' })
    const child = makeTaskRow('c', { parentId: 'p' })
    expect(validateInvariants(new RowStore([parent, child])).some(v => v.code === 'invalid_inbox')).toBe(true)
  })

  it('invalid_planned: on 缺 plannedDate', () => {
    const t = makeTaskRow('t1', { plannedMode: PLANNED_MODE.ON, plannedDate: null })
    expect(validateInvariants(new RowStore([t])).some(v => v.code === 'invalid_planned')).toBe(true)
  })

  it('invalid_planned: rolling 带 plannedDate', () => {
    const t = makeTaskRow('t1', {
      plannedMode: PLANNED_MODE.ROLLING,
      plannedDate: '2026-07-16T00:00:00.000Z',
    })
    expect(validateInvariants(new RowStore([t])).some(v => v.code === 'invalid_planned')).toBe(true)
  })

  it('invalid_defer_due: defer > due', () => {
    const t = makeTaskRow('t1', {
      deferDate: '2026-07-17T10:00:00.000Z',
      dueDate: '2026-07-16T10:00:00.000Z',
    })
    expect(validateInvariants(new RowStore([t])).some(v => v.code === 'invalid_defer_due')).toBe(true)
  })

  // 物理不变量：禁止「物理 completed ∧ 有效活跃直接子」。父完成时子的有效状态跟随父，完成父的活跃子有效变
  // 完成（非活跃）→ 不违反——此态由 effectiveStatus 派生层自动保证合法，invariant 静态检查恒不触发。
  it('completed_with_active_child: 父完成时完成父的活跃子有效变完成 → 不违反', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED, completedAt: '2026-07-16T00:00:00.000Z', mountDirId: 'd1', groupType: GROUP_TYPE.PARALLEL })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE, mountDirId: 'd1' })
    expect(validateInvariants(new RowStore([p, c])).some(v => v.code === 'completed_with_active_child')).toBe(false)
  })

  it('物理 completed 父有有效 hold 直接子 → 不违反（hold 子非有效活跃）', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED, completedAt: '2026-07-16T00:00:00.000Z', mountDirId: 'd1', groupType: GROUP_TYPE.PARALLEL })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.HOLD, heldAt: '2026-07-16T00:00:00.000Z', mountDirId: 'd1' })
    expect(validateInvariants(new RowStore([p, c])).some(v => v.code === 'completed_with_active_child')).toBe(false)
  })

  it('父完成时子的有效状态跟随父整链：完成父→搁置子→活跃孙 → 子孙有效变完成非活跃 → 不违反', () => {
    // m 的有效状态跟随 p 完成 → m 有效变完成；c 同随 p 有效变完成（非活跃）→ p 的直接子 m 非活跃，不违反
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED, completedAt: '2026-07-16T00:00:00.000Z', mountDirId: 'd1', groupType: GROUP_TYPE.PARALLEL })
    const m = makeTaskRow('m', { parentId: 'p', status: EXPLICIT_STATUS.HOLD, heldAt: '2026-07-16T00:00:00.000Z', mountDirId: 'd1', groupType: GROUP_TYPE.PARALLEL })
    const c = makeTaskRow('c', { parentId: 'm', status: EXPLICIT_STATUS.ACTIVE, mountDirId: 'd1' })
    expect(validateInvariants(new RowStore([p, m, c])).some(v => v.code === 'completed_with_active_child')).toBe(false)
  })
})
