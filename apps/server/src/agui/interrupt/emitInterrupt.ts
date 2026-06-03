import type { BaseEvent } from '@ag-ui/core'
import type { GraphTaskInterrupt } from '../langGraphInterrupt'
import { EventType } from '@ag-ui/core'
import { HITL_INTERRUPT_OUTCOME_REASON } from '../../hitl/contracts'

/** AG-UI + CopilotKit useInterrupt：CUSTOM(on_interrupt) 后 RUN_FINISHED(outcome: interrupt) */
export function emitInterruptAgUiEvents(
  interrupt: GraphTaskInterrupt,
  input: { threadId: string, runId: string },
): BaseEvent[] {
  const interruptId = interrupt.id?.trim() ?? ''
  return [
    {
      type: EventType.CUSTOM,
      name: 'on_interrupt',
      value: interrupt.value,
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
      outcome: {
        type: 'interrupt',
        interrupts: [{
          id: interruptId,
          value: interrupt.value,
          reason: HITL_INTERRUPT_OUTCOME_REASON,
        }],
      },
    },
  ]
}
