import type { BaseEvent, Interrupt, RunFinishedEvent, StateSnapshotEvent } from '@ag-ui/core'
import type { InterruptPayload } from '@langchain/langgraph'
import { EventType } from '@ag-ui/core'

/** HITL `interrupt({ type: 'approval', ... })` → AG-UI core reason */
export const INTERRUPT_REASON_CONFIRMATION = 'confirmation'

export interface BuildInterruptFinalizeOptions {
  threadId: string
  runId: string
  interrupts: readonly InterruptPayload[]
  snapshot?: Record<string, unknown>
  /** CopilotKit `useInterrupt` 仍订阅 CUSTOM(on_interrupt) */
  emitLegacyCustom?: boolean
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value != null && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>
  return undefined
}

function resolveInterruptReason(payload: Record<string, unknown>): string {
  if (typeof payload.reason === 'string' && payload.reason.trim())
    return payload.reason.trim()
  if (payload.type === 'approval')
    return INTERRUPT_REASON_CONFIRMATION
  if (typeof payload.type === 'string' && payload.type.trim())
    return payload.type.trim()
  return 'input_required'
}

export function mapInterruptPayloadToAgUi(lg: InterruptPayload): Interrupt {
  const payload = lg.payload
  const record = asRecord(payload) ?? {}
  const message = typeof record.message === 'string' ? record.message : undefined
  const toolCallId = typeof record.toolCallId === 'string' ? record.toolCallId : undefined
  const responseSchema = record.responseSchema != null
    && typeof record.responseSchema === 'object'
    ? record.responseSchema as Record<string, unknown>
    : undefined

  const interrupt: Interrupt = {
    id: lg.interruptId,
    reason: resolveInterruptReason(record),
    metadata: { ...record, payload },
  }
  if (message != null)
    interrupt.message = message
  if (toolCallId != null)
    interrupt.toolCallId = toolCallId
  if (responseSchema != null)
    interrupt.responseSchema = responseSchema
  return interrupt
}

export function mapInterruptPayloadsToAgUi(
  list: readonly InterruptPayload[],
): Interrupt[] {
  return list.map(mapInterruptPayloadToAgUi)
}

export function buildInterruptFinalizeEvents(
  options: BuildInterruptFinalizeOptions,
): BaseEvent[] {
  const {
    threadId,
    runId,
    interrupts,
    snapshot,
    emitLegacyCustom = true,
  } = options

  const aguiInterrupts = mapInterruptPayloadsToAgUi(interrupts)
  const events: BaseEvent[] = []

  if (snapshot != null) {
    const stateSnapshot: StateSnapshotEvent = {
      type: EventType.STATE_SNAPSHOT,
      snapshot,
    }
    events.push(stateSnapshot)
  }

  if (emitLegacyCustom) {
    for (const lg of interrupts) {
      events.push({
        type: EventType.CUSTOM,
        name: 'on_interrupt',
        value: lg.payload,
      })
    }
  }

  const runFinished: RunFinishedEvent = {
    type: EventType.RUN_FINISHED,
    threadId,
    runId,
    outcome: {
      type: 'interrupt',
      interrupts: aguiInterrupts,
    },
  }
  events.push(runFinished)
  return events
}
