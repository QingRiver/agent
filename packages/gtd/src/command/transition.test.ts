import { describe, expect, it } from 'vitest'
import { EXPLICIT_STATUS } from '../data/types'
import { makeRepeatRule, makeTaskRow } from '../fixtures'
import {
  availableStatusActions,
  canTransition,
  STATUS_ACTIONS,
  STATUS_TRANSITIONS,
} from './transition'

const ALL_STATUSES = [
  EXPLICIT_STATUS.ACTIVE,
  EXPLICIT_STATUS.COMPLETED,
  EXPLICIT_STATUS.HOLD,
  EXPLICIT_STATUS.DELETED,
] as const

describe('status transitions 表驱动', () => {
  it('每个状态的 availableStatusActions 与表一致（无特殊 guard）', () => {
    for (const status of ALL_STATUSES) {
      const task = makeTaskRow('t1', { status })
      const expected = STATUS_ACTIONS.filter((action) => {
        const spec = STATUS_TRANSITIONS[action]
        return status !== spec.to && spec.from.includes(status)
      })
      expect(availableStatusActions(task).sort()).toEqual(expected.sort())
    }
  })

  it('completed + repeatRule 时 reopen 不可用', () => {
    const task = makeTaskRow('t1', {
      status: EXPLICIT_STATUS.COMPLETED,
      repeatRule: makeRepeatRule({ id: 'r1' }),
      statusChangedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(canTransition(task, 'reopen')).toBe(false)
    expect(availableStatusActions(task)).not.toContain('reopen')
    expect(availableStatusActions(task)).toContain('delete')
  })

  it('active 可 complete / drop / delete', () => {
    const task = makeTaskRow('t1')
    expect(availableStatusActions(task).sort()).toEqual(['complete', 'delete', 'drop'])
  })

  it('已在目标态 canTransition 为 false', () => {
    for (const action of STATUS_ACTIONS) {
      const spec = STATUS_TRANSITIONS[action]
      const task = makeTaskRow('t1', { status: spec.to })
      expect(canTransition(task, action)).toBe(false)
    }
  })

  it('from 外的状态 canTransition 为 false', () => {
    for (const action of STATUS_ACTIONS) {
      const spec = STATUS_TRANSITIONS[action]
      for (const status of ALL_STATUSES) {
        if (status === spec.to || spec.from.includes(status))
          continue
        const task = makeTaskRow('t1', { status })
        expect(canTransition(task, action)).toBe(false)
      }
    }
  })
})
