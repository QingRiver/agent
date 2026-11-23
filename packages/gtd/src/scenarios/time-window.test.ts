/**
 * wiki/GTD.md「解锁时间应早于截止时间」场景 A / B / C。
 */
import { describe, expect, it } from 'vitest'
import { makeTaskRow } from '../fixtures'
import { planPatchTaskOp } from '../plan/tasks'
import { act, task } from './run'

const D = (day: number) => `2026-05-${String(day).padStart(2, '0')}T00:00:00.000Z`

describe('解锁与截止的窗口', () => {
  it('推迟解锁越过截止：截止钳到同一时刻', () => {
    const rows = [makeTaskRow('t', { deferDate: D(1), dueDate: D(5) })]
    const after = act(rows, (model, ids) => planPatchTaskOp(model, 't', { deferDate: D(10) }, ids))
    expect(task(after, 't').data.deferDate).toBe(D(10))
    expect(task(after, 't').data.dueDate).toBe(D(10))
  })

  it('提前截止早于解锁：解锁钳到同一时刻', () => {
    const rows = [makeTaskRow('t', { deferDate: D(5), dueDate: D(10) })]
    const after = act(rows, (model, ids) => planPatchTaskOp(model, 't', { dueDate: D(1) }, ids))
    expect(task(after, 't').data.deferDate).toBe(D(1))
    expect(task(after, 't').data.dueDate).toBe(D(1))
  })

  it('窗口变宽时另一侧保持不变', () => {
    const rows = [makeTaskRow('t', { deferDate: D(1), dueDate: D(5) })]
    const after = act(rows, (model, ids) => planPatchTaskOp(model, 't', { dueDate: D(20) }, ids))
    expect(task(after, 't').data.deferDate).toBe(D(1))
    expect(task(after, 't').data.dueDate).toBe(D(20))
  })
})
