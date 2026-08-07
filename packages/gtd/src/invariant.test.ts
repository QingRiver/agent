import { describe, expect, it } from 'vitest'
import { makeTaskRow, makeTaskTagRow } from './__tests__/sync-fixtures'
import { validateInvariants } from './invariant'
import { RowStore } from './rows'
import { EXPLICIT_STATUS, PLANNED_MODE } from './types'

describe('validateInvariants', () => {
  it('合法 rows 返回空数组', () => {
    const t = makeTaskRow('t1', { mountDirId: 'd1' })
    expect(validateInvariants(new RowStore([t]))).toEqual([])
  })

  it('task_on_hold: Task.status=on_hold', () => {
    const t = makeTaskRow('t1', { status: EXPLICIT_STATUS.ON_HOLD })
    expect(validateInvariants(new RowStore([t])).some(v => v.code === 'task_on_hold')).toBe(true)
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

  it('broken_reference: tagId 悬空', () => {
    const t = makeTaskRow('t1')
    const tt = makeTaskTagRow('t1', 'missing')
    expect(validateInvariants(new RowStore([t, tt])).some(v => v.code === 'broken_reference')).toBe(true)
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
})
