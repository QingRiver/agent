import type { GtdDocument, Project, ReviewConfig } from './schema'
import { REVIEW_INTERVAL } from './types'

/**
 * 回顾机制（SPEC §5.4）。Project 级。
 */

const DAY = 86400000

/** 推算下一次回顾日期：lastReviewDate + interval（custom 用 customDays） */
export function computeNextReviewDate(config: ReviewConfig, now: Date): string {
  const base = config.lastReviewDate ? new Date(config.lastReviewDate) : now
  switch (config.interval) {
    case REVIEW_INTERVAL.WEEKLY:
      return new Date(base.getTime() + 7 * DAY).toISOString()
    case REVIEW_INTERVAL.BIWEEKLY:
      return new Date(base.getTime() + 14 * DAY).toISOString()
    case REVIEW_INTERVAL.MONTHLY: {
      const d = new Date(base)
      d.setUTCMonth(d.getUTCMonth() + 1)
      return d.toISOString()
    }
    case REVIEW_INTERVAL.QUARTERLY: {
      const d = new Date(base)
      d.setUTCMonth(d.getUTCMonth() + 3)
      return d.toISOString()
    }
    case REVIEW_INTERVAL.YEARLY: {
      const d = new Date(base)
      d.setUTCFullYear(d.getUTCFullYear() + 1)
      return d.toISOString()
    }
    case REVIEW_INTERVAL.CUSTOM:
      return new Date(base.getTime() + (config.customDays ?? 0) * DAY).toISOString()
  }
}

/** 是否需要回顾：now >= nextReviewDate */
export function needsReview(project: Project, now: Date): boolean {
  return now.getTime() >= new Date(project.review.nextReviewDate).getTime()
}

/** 标记已回顾：lastReviewDate=now，重算 nextReviewDate，needsReview=false */
export function markReviewed(doc: GtdDocument, projectId: string, now: Date): GtdDocument {
  return {
    ...doc,
    projects: doc.projects.map((p) => {
      if (p.id !== projectId)
        return p
      const nextReviewDate = computeNextReviewDate(p.review, now)
      return {
        ...p,
        review: {
          ...p.review,
          lastReviewDate: now.toISOString(),
          nextReviewDate,
          needsReview: false,
        },
      }
    }),
  }
}
