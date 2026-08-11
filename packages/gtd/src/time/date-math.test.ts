import { describe, expect, it } from 'vitest'
import { makeRepeatRule, NOW } from '../fixtures'
import { shouldStop } from './date-math'

const DAY = 86400000

describe('shouldStop', () => {
  it('completedOccurrences>=maxOccurrences→true', () => {
    const rule = makeRepeatRule({ maxOccurrences: 3, completedOccurrences: 3 })
    expect(shouldStop(rule, NOW)).toBe(true)
  })

  it('now>endDate→true', () => {
    const rule = makeRepeatRule({ endDate: new Date(NOW.getTime() - DAY).toISOString() })
    expect(shouldStop(rule, NOW)).toBe(true)
  })

  it('否则→false', () => {
    expect(shouldStop(makeRepeatRule(), NOW)).toBe(false)
  })
})
