import { describe, expect, it } from 'vitest'
import { normalizeDeferDue } from './normalize'

describe('normalizeDeferDue', () => {
  const base = {
    deferDate: '2026-07-16T00:00:00.000Z',
    dueDate: '2026-07-18T23:59:00.000Z',
  }

  it('合法 defer≤due 保持', () => {
    expect(normalizeDeferDue(base, { deferDate: '2026-07-17T00:00:00.000Z' })).toEqual({
      deferDate: '2026-07-17T00:00:00.000Z',
      dueDate: '2026-07-18T23:59:00.000Z',
    })
  })

  it('相等合法', () => {
    const iso = '2026-07-16T12:00:00.000Z'
    expect(normalizeDeferDue({ deferDate: null, dueDate: null }, { deferDate: iso, dueDate: iso }))
      .toEqual({ deferDate: iso, dueDate: iso })
  })

  it('只改 defer 导致非法 → due=defer', () => {
    expect(normalizeDeferDue(base, { deferDate: '2026-07-20T00:00:00.000Z' })).toEqual({
      deferDate: '2026-07-20T00:00:00.000Z',
      dueDate: '2026-07-20T00:00:00.000Z',
    })
  })

  it('只改 due 导致非法 → defer=due', () => {
    expect(normalizeDeferDue(base, { dueDate: '2026-07-15T23:59:00.000Z' })).toEqual({
      deferDate: '2026-07-15T23:59:00.000Z',
      dueDate: '2026-07-15T23:59:00.000Z',
    })
  })

  it('同 patch 两者皆改仍非法 → due=defer', () => {
    expect(normalizeDeferDue(base, {
      deferDate: '2026-07-20T00:00:00.000Z',
      dueDate: '2026-07-18T00:00:00.000Z',
    })).toEqual({
      deferDate: '2026-07-20T00:00:00.000Z',
      dueDate: '2026-07-20T00:00:00.000Z',
    })
  })

  it('清空任一侧不联动', () => {
    expect(normalizeDeferDue(base, { deferDate: null })).toEqual({
      deferDate: null,
      dueDate: '2026-07-18T23:59:00.000Z',
    })
    expect(normalizeDeferDue(base, { dueDate: null })).toEqual({
      deferDate: '2026-07-16T00:00:00.000Z',
      dueDate: null,
    })
  })

  it('仅一侧有值不联动', () => {
    expect(normalizeDeferDue(
      { deferDate: null, dueDate: null },
      { deferDate: '2026-07-20T00:00:00.000Z' },
    )).toEqual({
      deferDate: '2026-07-20T00:00:00.000Z',
      dueDate: null,
    })
  })
})
