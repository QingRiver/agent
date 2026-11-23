import { describe, expect, it } from 'vitest'
import { makeTaskRow } from '../fixtures/factories'
import { GtdReader } from './reader'
import { EXPLICIT_STATUS } from './types'

describe('gtdReader', () => {
  it('caches taskTree until invalidate', () => {
    const rows = [makeTaskRow('a'), makeTaskRow('b', { parentId: 'a' })]
    const reader = new GtdReader(rows)
    const t1 = reader.taskTree()
    const t2 = reader.taskTree()
    expect(t1).toBe(t2)
    reader.invalidate()
    expect(reader.taskTree()).not.toBe(t1)
  })

  it('effectiveStatusOf uses cached tree', () => {
    const parent = makeTaskRow('p', { status: EXPLICIT_STATUS.HOLD, heldAt: '2026-01-01T00:00:00.000Z' })
    const child = makeTaskRow('c', { parentId: 'p' })
    const reader = new GtdReader([parent, child])
    expect(reader.effectiveStatusOf('c')).toBe(EXPLICIT_STATUS.HOLD)
  })
})
