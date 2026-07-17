import { describe, expect, it } from 'vitest'
import { makeDoc, makeProject, makeReviewConfig, NOW } from './__tests__/fixtures'
import { computeNextReviewDate, markReviewed, needsReview } from './review'
import { REVIEW_INTERVAL } from './types'

const DAY = 86400000

describe('computeNextReviewDate', () => {
  it('weekly: lastReviewDate + 7 天', () => {
    const config = makeReviewConfig({
      interval: REVIEW_INTERVAL.WEEKLY,
      lastReviewDate: NOW.toISOString(),
    })
    expect(computeNextReviewDate(config, NOW)).toBe(
      new Date(NOW.getTime() + 7 * DAY).toISOString(),
    )
  })

  it('custom: +customDays', () => {
    const config = makeReviewConfig({
      interval: REVIEW_INTERVAL.CUSTOM,
      customDays: 10,
      lastReviewDate: NOW.toISOString(),
    })
    expect(computeNextReviewDate(config, NOW)).toBe(
      new Date(NOW.getTime() + 10 * DAY).toISOString(),
    )
  })
})

describe('needsReview', () => {
  it('now>=nextReviewDate→true', () => {
    const review = makeReviewConfig({
      nextReviewDate: new Date(NOW.getTime() - DAY).toISOString(),
    })
    expect(needsReview(makeProject({ review }), NOW)).toBe(true)
  })

  it('now<nextReviewDate→false', () => {
    const review = makeReviewConfig({
      nextReviewDate: new Date(NOW.getTime() + DAY).toISOString(),
    })
    expect(needsReview(makeProject({ review }), NOW)).toBe(false)
  })
})

describe('markReviewed', () => {
  it('lastReviewDate=now，重算 nextReviewDate，needsReview=false', () => {
    const review = makeReviewConfig({ interval: REVIEW_INTERVAL.WEEKLY, needsReview: true })
    const p = makeProject({ id: 'p1', review })
    const out = markReviewed(makeDoc({ projects: [p] }), 'p1', NOW)
    const r = out.projects[0]?.review
    expect(r?.lastReviewDate).toBe(NOW.toISOString())
    expect(r?.needsReview).toBe(false)
    expect(r?.nextReviewDate).toBe(new Date(NOW.getTime() + 7 * DAY).toISOString())
  })
})
