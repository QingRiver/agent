import type { EntityRow, EntityRowOf } from '../data/row-schema'
import { describe, expect, it } from 'vitest'
import { REPEAT_ANCHOR, REPEAT_CYCLE } from '../data/types'
import { validateInvariants } from '../derived/invariant'
import { makeRepeatRule, makeTask, makeTaskRow, makeTransition, NOW } from '../fixtures'
import { GtdModel } from '../state/model'
import { applyOps } from './apply'
import { computeNextDates, repeatSuccessorId } from './repeat'

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

describe('完成重复任务克隆下一实例：同级 order', () => {
  const rule = makeRepeatRule({ id: 'r1', cycle: REPEAT_CYCLE.DAILY, anchor: REPEAT_ANCHOR.COMPLETION })
  const sibling = (id: string, order: number) => makeTaskRow(id, { mountDirId: 'd1', parentId: 'p', order })
  const complete = (rows: EntityRow[]) => {
    let n = 0
    const after = applyOps(rows, [makeTransition({ taskId: 't' })], 'u1', () => ++n)
    const nextId = repeatSuccessorId('r1', rule.completedOccurrences + 1)
    const task = after.find((r): r is EntityRowOf<'task'> => r.entity === 'task' && r.id === nextId)!
    return { after, task }
  }
  const base = () => [
    makeTaskRow('p', { mountDirId: 'd1', groupType: 'parallel' }),
    makeTaskRow('t', { mountDirId: 'd1', parentId: 'p', order: 1, repeatRule: rule }),
  ]

  it('新实例紧跟旧实例，夹在下一兄弟之前，不违反同级 order 唯一', () => {
    const rows = [...base(), sibling('s', 2)]
    const { after, task } = complete(rows)
    expect(task.data.order).toBe(1.5)
    expect(validateInvariants(new GtdModel(after))).toEqual([])
  })

  it('旧实例是最后一个：排在它之后', () => {
    const rows = base()
    const { after, task } = complete(rows)
    expect(task.data.order).toBe(2)
    expect(validateInvariants(new GtdModel(after))).toEqual([])
  })

  it('与下一兄弟之间已无空隙：排到同级末尾', () => {
    const rows = [...base(), sibling('s', 1 + 1e-12), sibling('z', 5)]
    const { after, task } = complete(rows)
    expect(task.data.order).toBe(6)
    expect(validateInvariants(new GtdModel(after))).toEqual([])
  })
})
