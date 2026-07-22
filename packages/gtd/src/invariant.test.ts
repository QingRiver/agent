import { describe, expect, it } from 'vitest'
import { makeProjectRow, makeTaskRow, makeTaskTagRow } from './__tests__/sync-fixtures'
import { validateInvariants } from './invariant'
import { RowStore } from './rows'
import { EXPLICIT_STATUS } from './types'

describe('validateInvariants', () => {
  it('合法 rows 返回空数组', () => {
    const t = makeTaskRow('t1', { projectId: 'p1' })
    const p = makeProjectRow('p1')
    expect(validateInvariants(new RowStore([t, p]))).toEqual([])
  })

  it('broken_reference: projectId 指向不存在的 project', () => {
    const t = makeTaskRow('t1', { projectId: 'nope' })
    expect(validateInvariants(new RowStore([t])).some(v => v.code === 'broken_reference')).toBe(true)
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
    const a = makeTaskRow('a', { parentId: 'b' })
    const b = makeTaskRow('b', { parentId: 'a' })
    expect(validateInvariants(new RowStore([a, b])).some(v => v.code === 'cycle')).toBe(true)
  })

  it('broken_reference: tagId 悬空', () => {
    const t = makeTaskRow('t1')
    const tt = makeTaskTagRow('t1', 'missing')
    expect(validateInvariants(new RowStore([t, tt])).some(v => v.code === 'broken_reference')).toBe(true)
  })

  it('duplicate_order: 不同 project 同 order 不冲突', () => {
    const a = makeTaskRow('a', { projectId: 'p1', order: 1 })
    const b = makeTaskRow('b', { projectId: 'p2', order: 1 })
    const p1 = makeProjectRow('p1')
    const p2 = makeProjectRow('p2')
    expect(validateInvariants(new RowStore([a, b, p1, p2]))).toEqual([])
  })
})
