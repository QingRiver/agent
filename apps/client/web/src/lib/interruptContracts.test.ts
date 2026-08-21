import { describe, expect, it } from 'vitest'
import { narrowAgUiPendingInterrupt } from './interruptContracts'

describe('narrowAgUiPendingInterrupt', () => {
  it('maps connect-style metadata (no nested payload)', () => {
    const request = narrowAgUiPendingInterrupt({
      id: 'id-1',
      metadata: {
        type: 'approval',
        message: '确认？',
        details: '详情',
      },
    })
    expect(request).toEqual({
      interruptId: 'id-1',
      type: 'approval',
      message: '确认？',
      details: '详情',
    })
  })

  it('maps live-style metadata with nested payload', () => {
    const request = narrowAgUiPendingInterrupt({
      id: 'id-2',
      metadata: {
        type: 'select',
        message: '选城市',
        options: [{ label: '北京', value: 'bj' }],
        payload: {
          type: 'select',
          message: '选城市',
          options: [{ label: '北京', value: 'bj' }],
        },
      },
    })
    expect(request).toMatchObject({
      interruptId: 'id-2',
      type: 'select',
      message: '选城市',
    })
  })

  it('returns null when id or metadata invalid', () => {
    expect(narrowAgUiPendingInterrupt(null)).toBeNull()
    expect(narrowAgUiPendingInterrupt({ id: '', metadata: { type: 'approval' } })).toBeNull()
    expect(narrowAgUiPendingInterrupt({ id: 'x', metadata: { type: 'unknown' } })).toBeNull()
  })
})
