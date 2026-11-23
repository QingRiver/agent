import { describe, expect, it } from 'vitest'
import { EXPLICIT_STATUS } from '../data/types'
import { makeTaskRow } from '../fixtures/factories'
import { GtdModel } from './model'

describe('gtdModel', () => {
  it('caches tree until invalidate', () => {
    const model = new GtdModel([makeTaskRow('a'), makeTaskRow('b', { parentId: 'a' })])
    const first = model.tree()
    expect(model.tree()).toBe(first)
    model.invalidate()
    expect(model.tree()).not.toBe(first)
  })

  it('effective status follows a held parent', () => {
    const parent = makeTaskRow('p', { status: EXPLICIT_STATUS.HOLD, statusChangedAt: '2026-01-01T00:00:00.000Z' })
    const child = makeTaskRow('c', { parentId: 'p' })
    const model = new GtdModel([parent, child])
    expect(model.effectiveStatus('c')).toBe(EXPLICIT_STATUS.HOLD)
  })

  it('folds a legacy completedAt into statusChangedAt', () => {
    const row = makeTaskRow('t')
    const data = {
      ...row.data,
      status: EXPLICIT_STATUS.COMPLETED,
      completedAt: '2026-01-01T00:00:00.000Z',
    }
    delete (data as { statusChangedAt?: string | null }).statusChangedAt
    const model = new GtdModel([{ ...row, data: data as typeof row.data }])
    expect(model.findTask('t')?.data.statusChangedAt).toBe('2026-01-01T00:00:00.000Z')
    expect('completedAt' in (model.findTask('t')?.data ?? {})).toBe(false)
  })
})
