/**
 * wiki/GTD.md「计算状态」判定顺序，以及「执行状态」三档。
 * 串行只挡住可执行性，不挡住完成。
 */
import { describe, expect, it } from 'vitest'
import { AVAILABILITY_FILTER, COMPUTED_STATUS, EXPLICIT_STATUS, GROUP_TYPE } from '../data/types'
import { computeAvailability } from '../derived/availability'
import { DUE_SOON_MS, isoFromNow, makeTaskRow, NOW } from '../fixtures'
import { planStatusOp } from '../plan/tasks'
import { matchesAvailability } from '../view/perspective'
import { act, read, task } from './run'

function computed(rows: Parameters<typeof read>[0], id: string) {
  const view = read(rows)
  return computeAvailability(task(rows, id), NOW, view.tree, DUE_SOON_MS)
}

describe('计算状态', () => {
  it('有效状态不是活跃时阻塞', () => {
    const row = makeTaskRow('t', { status: EXPLICIT_STATUS.COMPLETED, statusChangedAt: NOW.toISOString() })
    expect(computed([row], 't')).toBe(COMPUTED_STATUS.BLOCKED)
  })

  it('解锁时间还没到时阻塞', () => {
    const row = makeTaskRow('t', { deferDate: isoFromNow(60_000) })
    expect(computed([row], 't')).toBe(COMPUTED_STATUS.BLOCKED)
  })

  it('串行前序还活跃时后序阻塞，但后序仍可完成', () => {
    const rows = [
      makeTaskRow('p', { groupType: GROUP_TYPE.SEQUENTIAL, mountDirId: 'd' }),
      makeTaskRow('a', { parentId: 'p', order: 0, mountDirId: 'd' }),
      makeTaskRow('b', { parentId: 'p', order: 1, mountDirId: 'd' }),
    ]
    expect(computed(rows, 'b')).toBe(COMPUTED_STATUS.BLOCKED)
    const after = act(rows, (model, ids) => planStatusOp(model, 'complete', 'b', ids))
    expect(read(after).physical('b')).toBe(EXPLICIT_STATUS.COMPLETED)
  })

  it('截止已过是已逾期，临近是即将逾期，其余可执行', () => {
    const overdue = makeTaskRow('late', { dueDate: isoFromNow(-60_000) })
    const soon = makeTaskRow('soon', { dueDate: isoFromNow(DUE_SOON_MS / 2) })
    const open = makeTaskRow('open', {})
    expect(computed([overdue], 'late')).toBe(COMPUTED_STATUS.OVERDUE)
    expect(computed([soon], 'soon')).toBe(COMPUTED_STATUS.DUE_SOON)
    expect(computed([open], 'open')).toBe(COMPUTED_STATUS.AVAILABLE)
  })
})

describe('执行状态', () => {
  it('可执行要活跃且未阻塞，未完成只看有效活跃，全部不含回收站', () => {
    const open = makeTaskRow('open', {})
    const blocked = makeTaskRow('blocked', { deferDate: isoFromNow(60_000) })
    const done = makeTaskRow('done', { status: EXPLICIT_STATUS.COMPLETED, statusChangedAt: NOW.toISOString() })
    const trashed = makeTaskRow('trashed', { status: EXPLICIT_STATUS.DELETED, statusChangedAt: NOW.toISOString() })
    const rows = [open, blocked, done, trashed]
    const view = read(rows)
    const seen = (id: string, filter: typeof AVAILABILITY_FILTER[keyof typeof AVAILABILITY_FILTER]) =>
      matchesAvailability(task(rows, id), filter, computed(rows, id), view.tree)

    expect(seen('open', AVAILABILITY_FILTER.AVAILABLE)).toBe(true)
    expect(seen('blocked', AVAILABILITY_FILTER.AVAILABLE)).toBe(false)
    expect(seen('blocked', AVAILABILITY_FILTER.REMAINING)).toBe(true)
    expect(seen('done', AVAILABILITY_FILTER.REMAINING)).toBe(false)
    expect(seen('done', AVAILABILITY_FILTER.ALL)).toBe(true)
    expect(seen('trashed', AVAILABILITY_FILTER.ALL)).toBe(false)
  })
})
