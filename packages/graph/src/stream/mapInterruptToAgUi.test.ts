import type { ApprovalInterruptPayload } from '../hitl/types.js'
import { EventType } from '@ag-ui/core'
import { describe, expect, it } from 'vitest'
import {
  buildInterruptFinalizeEvents,
  INTERRUPT_REASON_CONFIRMATION,
  mapInterruptPayloadToAgUi,
} from './mapInterruptToAgUi.js'

describe('mapInterruptToAgUi', () => {
  it('maps ApprovalInterruptPayload to AG-UI Interrupt', () => {
    const payload: ApprovalInterruptPayload = {
      type: 'approval',
      message: '请确认敏感操作：转账',
      details: '向 0x123 转账 100 ETH',
    }

    const interrupt = mapInterruptPayloadToAgUi({
      interruptId: 'int-1',
      payload,
    })

    expect(interrupt).toMatchObject({
      id: 'int-1',
      reason: INTERRUPT_REASON_CONFIRMATION,
      message: '请确认敏感操作：转账',
      metadata: expect.objectContaining({
        type: 'approval',
        details: '向 0x123 转账 100 ETH',
      }),
    })
  })

  it('buildInterruptFinalizeEvents emits snapshot, legacy CUSTOM, and RUN_FINISHED interrupt', () => {
    const events = buildInterruptFinalizeEvents({
      threadId: 't1',
      runId: 'r1',
      interrupts: [{
        interruptId: 'int-1',
        payload: { type: 'approval', message: '确认？', details: 'x' },
      }],
      snapshot: { input: 'test' },
    })

    expect(events[0]).toMatchObject({
      type: EventType.STATE_SNAPSHOT,
      snapshot: { input: 'test' },
    })
    expect(events[1]).toMatchObject({
      type: EventType.CUSTOM,
      name: 'on_interrupt',
    })
    expect(events[2]).toMatchObject({
      type: EventType.RUN_FINISHED,
      threadId: 't1',
      runId: 'r1',
      outcome: {
        type: 'interrupt',
        interrupts: [expect.objectContaining({
          id: 'int-1',
          reason: INTERRUPT_REASON_CONFIRMATION,
        })],
      },
    })
  })
})
