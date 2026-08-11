import { describe, expect, it } from 'vitest'
import { REPEAT_ANCHOR, REPEAT_CYCLE } from '../data/types'
import { makeRepeatRule, makeTask, NOW } from '../fixtures'
import { computeNextDates } from './repeat'

const DAY = 86400000

describe('computeNextDates', () => {
  it('completion anchor: 基准=now，daily+1 → 次日', () => {
    const rule = makeRepeatRule({
      cycle: REPEAT_CYCLE.DAILY,
      interval: 1,
      anchor: REPEAT_ANCHOR.COMPLETION,
    })
    const t = makeTask({ dueDate: NOW.toISOString() })
    expect(computeNextDates(rule, t, NOW).dueDate).toBe(
      new Date(NOW.getTime() + DAY).toISOString(),
    )
  })

  it('due anchor: 基准=旧 dueDate', () => {
    const oldDue = new Date('2026-07-10T00:00:00Z')
    const rule = makeRepeatRule({
      cycle: REPEAT_CYCLE.WEEKLY,
      interval: 1,
      anchor: REPEAT_ANCHOR.DUE,
    })
    const t = makeTask({ dueDate: oldDue.toISOString() })
    expect(computeNextDates(rule, t, NOW).dueDate).toBe(
      new Date(oldDue.getTime() + 7 * DAY).toISOString(),
    )
  })

  it('defer anchor: 基准=旧 deferDate', () => {
    const oldDefer = new Date('2026-07-10T00:00:00Z')
    const rule = makeRepeatRule({
      cycle: REPEAT_CYCLE.DAILY,
      interval: 1,
      anchor: REPEAT_ANCHOR.DEFER,
    })
    const t = makeTask({ deferDate: oldDefer.toISOString() })
    expect(computeNextDates(rule, t, NOW).deferDate).toBe(
      new Date(oldDefer.getTime() + DAY).toISOString(),
    )
  })

  it('weekly daysOfWeek 对齐到下一个允许日', () => {
    const friday = new Date('2026-07-17T12:00:00Z') // Friday
    const rule = makeRepeatRule({
      cycle: REPEAT_CYCLE.WEEKLY,
      interval: 1,
      anchor: REPEAT_ANCHOR.COMPLETION,
      daysOfWeek: [1], // Monday
    })
    const t = makeTask()
    const next = computeNextDates(rule, t, friday)
    expect(new Date(next.dueDate as string).getUTCDay()).toBe(1)
  })

  it('保持 defer-due 间隔', () => {
    const oldDefer = new Date('2026-07-10T00:00:00Z')
    const oldDue = new Date('2026-07-12T00:00:00Z')
    const rule = makeRepeatRule({
      cycle: REPEAT_CYCLE.WEEKLY,
      interval: 1,
      anchor: REPEAT_ANCHOR.DUE,
    })
    const t = makeTask({ deferDate: oldDefer.toISOString(), dueDate: oldDue.toISOString() })
    const next = computeNextDates(rule, t, NOW)
    const dueMs = new Date(next.dueDate as string).getTime()
    const deferMs = new Date(next.deferDate as string).getTime()
    expect(dueMs - deferMs).toBe(2 * DAY)
  })
})
