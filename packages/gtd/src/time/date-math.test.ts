import { describe, expect, it } from 'vitest'
import { makeRepeatRule, NOW } from '../fixtures'
import { shouldStop } from './date-math'

const DAY = 86400000

describe('shouldStop', () => {
  it('maxOccurrences 是实例总数：完成第 max 个实例时终止', () => {
    expect(shouldStop(makeRepeatRule({ maxOccurrences: 3, completedOccurrences: 1 }), NOW)).toBe(false)
    expect(shouldStop(makeRepeatRule({ maxOccurrences: 3, completedOccurrences: 2 }), NOW)).toBe(true)
    expect(shouldStop(makeRepeatRule({ maxOccurrences: 1, completedOccurrences: 0 }), NOW)).toBe(true)
  })

  it('now>endDate→true', () => {
    const rule = makeRepeatRule({ endDate: new Date(NOW.getTime() - DAY).toISOString() })
    expect(shouldStop(rule, NOW)).toBe(true)
  })

  it('否则→false', () => {
    expect(shouldStop(makeRepeatRule(), NOW)).toBe(false)
  })
})
