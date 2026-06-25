import type { BaseEvent, Interrupt } from '@ag-ui/core'
import type { PendingInterrupt } from '../../shared/conversation'
import { EventType } from '@ag-ui/core'
import { INTERRUPT_REASON_CONFIRMATION } from '@agent/graph'

export function pendingInterruptToAgUi(pending: PendingInterrupt): Interrupt {
  const { interruptId, ...payload } = pending
  const message = pending.type === 'modal' ? pending.title : pending.message
  return {
    id: interruptId,
    reason: pending.type === 'approval' ? INTERRUPT_REASON_CONFIRMATION : pending.type,
    message,
    metadata: payload,
  }
}

/** CUSTOM on_interrupt value：与 live run 一致，不含 interruptId */
export function pendingInterruptCustomValue(pending: PendingInterrupt): Record<string, unknown> {
  const { interruptId: _, ...rest } = pending
  return rest
}

export function buildPendingInterruptConnectEvents(
  threadId: string,
  runId: string,
  pending: PendingInterrupt,
): BaseEvent[] {
  const aguiInterrupt = pendingInterruptToAgUi(pending)
  return [
    {
      type: EventType.CUSTOM,
      name: 'on_interrupt',
      value: pendingInterruptCustomValue(pending),
    },
    {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      outcome: {
        type: 'interrupt',
        interrupts: [aguiInterrupt],
      },
    },
  ]
}
