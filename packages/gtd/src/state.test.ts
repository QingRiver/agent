import { describe, expect, it } from 'vitest'
import { makeDoc, makeProject, makeRepeatRule, makeTask, NOW } from './__tests__/fixtures'
import { complete, deleteTask, drop, hold, reopen, restore, resume } from './state'
import { EXPLICIT_STATUS } from './types'

function task(doc: ReturnType<typeof makeDoc>, id: string) {
  return doc.tasks.find(t => t.id === id)
}

describe('complete', () => {
  it('active→completed 且设 completedAt', () => {
    const t = makeTask({ id: 't1', status: EXPLICIT_STATUS.ACTIVE })
    const out = complete(makeDoc({ tasks: [t] }), 't1', NOW)
    expect(task(out, 't1')?.status).toBe(EXPLICIT_STATUS.COMPLETED)
    expect(task(out, 't1')?.completedAt).toBe(NOW.toISOString())
  })

  it('不修改原 doc（不可变）', () => {
    const doc = makeDoc({ tasks: [makeTask({ id: 't1' })] })
    complete(doc, 't1', NOW)
    expect(doc.tasks[0]?.status).toBe(EXPLICIT_STATUS.ACTIVE)
  })

  it('带 repeatRule 时触发克隆下一实例', () => {
    const rule = makeRepeatRule({ id: 'r1' })
    const t = makeTask({ id: 't1', repeatRuleId: 'r1' })
    const out = complete(makeDoc({ tasks: [t], repeatRules: [rule] }), 't1', NOW)
    expect(out.tasks).toHaveLength(2)
    const clone = out.tasks.find(x => x.repeatedFromTaskId === 't1')
    expect(clone?.status).toBe(EXPLICIT_STATUS.ACTIVE)
  })

  it('非 active 状态抛错', () => {
    const t = makeTask({ id: 't1', status: EXPLICIT_STATUS.COMPLETED })
    expect(() => complete(makeDoc({ tasks: [t] }), 't1', NOW)).toThrow()
  })
})

describe('drop', () => {
  it('active→cancelled 且设 droppedAt', () => {
    const out = drop(makeDoc({ tasks: [makeTask({ id: 't1' })] }), 't1', NOW)
    expect(task(out, 't1')?.status).toBe(EXPLICIT_STATUS.CANCELLED)
    expect(task(out, 't1')?.droppedAt).toBe(NOW.toISOString())
  })
})

describe('deleteTask', () => {
  it('→deleted 且不从 tasks 移除', () => {
    const out = deleteTask(makeDoc({ tasks: [makeTask({ id: 't1' })] }), 't1', NOW)
    expect(out.tasks).toHaveLength(1)
    expect(task(out, 't1')?.status).toBe(EXPLICIT_STATUS.DELETED)
    expect(task(out, 't1')?.droppedAt).toBe(NOW.toISOString())
  })
})

describe('hold / resume', () => {
  it('hold: project→on_hold', () => {
    const out = hold(makeDoc({ projects: [makeProject({ id: 'p1' })] }), 'p1')
    expect(out.projects[0]?.status).toBe(EXPLICIT_STATUS.ON_HOLD)
  })

  it('resume: on_hold→active', () => {
    const p = makeProject({ id: 'p1', status: EXPLICIT_STATUS.ON_HOLD })
    const out = resume(makeDoc({ projects: [p] }), 'p1')
    expect(out.projects[0]?.status).toBe(EXPLICIT_STATUS.ACTIVE)
  })
})

describe('reopen / restore', () => {
  it('reopen: completed→active 且清 completedAt', () => {
    const t = makeTask({ id: 't1', status: EXPLICIT_STATUS.COMPLETED, completedAt: NOW.toISOString() })
    const out = reopen(makeDoc({ tasks: [t] }), 't1')
    expect(task(out, 't1')?.status).toBe(EXPLICIT_STATUS.ACTIVE)
    expect(task(out, 't1')?.completedAt).toBeNull()
  })

  it('restore: cancelled→active 且清 droppedAt', () => {
    const t = makeTask({ id: 't1', status: EXPLICIT_STATUS.CANCELLED, droppedAt: NOW.toISOString() })
    const out = restore(makeDoc({ tasks: [t] }), 't1')
    expect(task(out, 't1')?.status).toBe(EXPLICIT_STATUS.ACTIVE)
    expect(task(out, 't1')?.droppedAt).toBeNull()
  })
})
