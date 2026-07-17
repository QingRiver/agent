import { describe, expect, it } from 'vitest'
import { makeDoc, makeProject, makeTask } from './__tests__/fixtures'
import { validateInvariants } from './invariant'
import { EXPLICIT_STATUS } from './types'

describe('validateInvariants', () => {
  it('合法 doc 返回空数组', () => {
    const t = makeTask({ id: 't1', projectId: 'p1' })
    const p = makeProject({ id: 'p1' })
    expect(validateInvariants(makeDoc({ tasks: [t], projects: [p] }))).toEqual([])
  })

  it('broken_reference: projectId 指向不存在的 project', () => {
    const t = makeTask({ id: 't1', projectId: 'nope' })
    const violations = validateInvariants(makeDoc({ tasks: [t] }))
    expect(violations.some(v => v.code === 'broken_reference')).toBe(true)
  })

  it('task_on_hold: Task.status=on_hold', () => {
    const t = makeTask({ id: 't1', status: EXPLICIT_STATUS.ON_HOLD })
    const violations = validateInvariants(makeDoc({ tasks: [t] }))
    expect(violations.some(v => v.code === 'task_on_hold')).toBe(true)
  })

  it('missing_terminal_timestamp: completed 无 completedAt', () => {
    const t = makeTask({ id: 't1', status: EXPLICIT_STATUS.COMPLETED, completedAt: null })
    const violations = validateInvariants(makeDoc({ tasks: [t] }))
    expect(violations.some(v => v.code === 'missing_terminal_timestamp')).toBe(true)
  })

  it('cycle: parentId 成环', () => {
    const a = makeTask({ id: 'a', parentId: 'b' })
    const b = makeTask({ id: 'b', parentId: 'a' })
    const violations = validateInvariants(makeDoc({ tasks: [a, b] }))
    expect(violations.some(v => v.code === 'cycle')).toBe(true)
  })

  it('broken_reference: tagId 悬空', () => {
    const t = makeTask({ id: 't1', tagIds: ['missing'] })
    const violations = validateInvariants(makeDoc({ tasks: [t] }))
    expect(violations.some(v => v.code === 'broken_reference')).toBe(true)
  })

  it('duplicate_order: 不同 project 同 order 不冲突', () => {
    const a = makeTask({ id: 'a', projectId: 'p1', order: 1 })
    const b = makeTask({ id: 'b', projectId: 'p2', order: 1 })
    expect(validateInvariants(makeDoc({ tasks: [a, b], projects: [makeProject({ id: 'p1' }), makeProject({ id: 'p2' })] }))).toEqual([])
  })
})
