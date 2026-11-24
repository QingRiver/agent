/**
 * wiki/GTD.md「按状态重复」：完成一条带规则的任务，克隆下一实例。
 */
import { describe, expect, it } from 'vitest'
import { repeatSuccessorId } from '../command/repeat'
import { EXPLICIT_STATUS, REPEAT_ANCHOR, REPEAT_CYCLE } from '../data/types'
import { makeTaskRow } from '../fixtures'
import { planSetTaskRepeatOp } from '../plan/repeat'
import { planStatusOp } from '../plan/tasks'
import { act, read, task } from './run'

describe('重复', () => {
  it('完成后旧实例完成，下一实例活跃并记下从哪条克隆', () => {
    const rows = [makeTaskRow('t', { dueDate: '2026-07-01T00:00:00.000Z', mountDirId: 'd' })]
    const withRule = act(rows, (model, ids) => planSetTaskRepeatOp(model, 't', {
      cycle: REPEAT_CYCLE.DAILY,
      interval: 1,
      anchor: REPEAT_ANCHOR.COMPLETION,
      daysOfWeek: [],
      endDate: null,
      maxOccurrences: null,
    }, ids))
    const ruleId = task(withRule, 't').data.repeatRule?.id
    const after = act(withRule, (model, ids) => planStatusOp(model, 'complete', 't', ids))
    const nextId = repeatSuccessorId(ruleId!, 1)
    const view = read(after)
    expect(view.physical('t')).toBe(EXPLICIT_STATUS.COMPLETED)
    expect(task(after, 't').data.repeatRule?.completedOccurrences).toBe(1)
    expect(view.physical(nextId)).toBe(EXPLICIT_STATUS.ACTIVE)
    expect(task(after, nextId).data.repeatedFromTaskId).toBe('t')
  })

  it('达到次数上限后只完成，不再克隆', () => {
    const rows = [makeTaskRow('t', { mountDirId: 'd' })]
    const withRule = act(rows, (model, ids) => planSetTaskRepeatOp(model, 't', {
      cycle: REPEAT_CYCLE.DAILY,
      interval: 1,
      anchor: REPEAT_ANCHOR.COMPLETION,
      daysOfWeek: [],
      endDate: null,
      maxOccurrences: 1,
    }, ids))
    const after = act(withRule, (model, ids) => planStatusOp(model, 'complete', 't', ids))
    expect(read(after).physical('t')).toBe(EXPLICIT_STATUS.COMPLETED)
    expect(after.filter(row => row.entity === 'task')).toHaveLength(1)
  })
})
