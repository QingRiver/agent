import { describe, expect, it } from 'vitest'
import { buildPendingInterruptConnectEvents, pendingInterruptToAgUi } from './pendingInterruptAgUi'

describe('pendingInterruptAgUi', () => {
  it('maps select pending interrupt for connect replay', () => {
    const pending = {
      interruptId: '35505f6f0c8428daba4a3d36030fafd2',
      type: 'select' as const,
      message: '请选择优先级',
      options: [{ label: '高', value: 'high' }],
    }
    const agui = pendingInterruptToAgUi(pending)
    expect(agui.id).toBe(pending.interruptId)
    expect(agui.reason).toBe('select')

    const events = buildPendingInterruptConnectEvents('t1', 'run-1', pending)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'RUN_FINISHED',
      outcome: { type: 'interrupt', interrupts: [agui] },
    })
  })

  it('maps approval pending interrupt with confirmation reason', () => {
    const pending = {
      interruptId: 'apr-1',
      type: 'approval' as const,
      message: '确认？',
      details: '详情',
    }
    const agui = pendingInterruptToAgUi(pending)
    expect(agui.id).toBe('apr-1')
    expect(agui.reason).toBe('confirmation')
    expect(agui.metadata).toEqual({
      type: 'approval',
      message: '确认？',
      details: '详情',
    })
  })
})
