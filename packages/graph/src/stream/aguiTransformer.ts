import type {
  CustomEvent,
  RunFinishedEvent,
  StateSnapshotEvent,
} from '@ag-ui/core'
import type {
  InterruptPayload,
  MessagesEventData,
  ProtocolEvent,
  StreamChannel,
  StreamTransformer,
  ToolsEventData,
} from '@langchain/langgraph'
import type { BuildInterruptFinalizeOptions } from './mapInterruptToAgUi.js'
import type { AguiTextMessageEvent } from './mapMessagesToAgUi.js'
import type { AguiToolEvent } from './mapToolsToAgUi.js'
import { EventType } from '@ag-ui/core'
import { StreamChannel as StreamChannelImpl } from '@langchain/langgraph'
import { aguiRunContext } from './aguiRunContext.js'
import { buildInterruptFinalizeEvents } from './mapInterruptToAgUi.js'
import { mapMessagesEventDataToAgUi } from './mapMessagesToAgUi.js'
import { mapToolsEventDataToAgUi } from './mapToolsToAgUi.js'

export type AguiMappedEvent
  = | AguiToolEvent
    | AguiTextMessageEvent
    | CustomEvent
    | StateSnapshotEvent
    | RunFinishedEvent

interface TaskEventData {
  interrupts?: Array<{
    id?: string
    interruptId?: string
    value?: unknown
    payload?: unknown
  }>
}

export interface AguiFinalizeContext {
  threadId: string
  runId: string
}

export interface AguiExtensions {
  aguiEvents: StreamChannel<AguiMappedEvent>
  toolEvents: StreamChannel<AguiToolEvent>
  customEvents: StreamChannel<CustomEvent>
  messageEvents: StreamChannel<AguiTextMessageEvent>
}

export class AguiTransformer implements StreamTransformer<AguiExtensions> {
  #aguiEvents!: StreamChannel<AguiMappedEvent>
  #toolEvents!: StreamChannel<AguiToolEvent>
  #customEvents!: StreamChannel<CustomEvent>
  #messageEvents!: StreamChannel<AguiTextMessageEvent>
  readonly #textMessageState = { activeMessageId: null as string | null }
  #lastValues: Record<string, unknown> | undefined
  readonly #interrupts = new Map<string, InterruptPayload>()
  #emittedRunFinished = false

  init(): AguiExtensions {
    this.#aguiEvents = StreamChannelImpl.local<AguiMappedEvent>()
    this.#toolEvents = StreamChannelImpl.local<AguiToolEvent>()
    this.#customEvents = StreamChannelImpl.local<CustomEvent>()
    this.#messageEvents = StreamChannelImpl.local<AguiTextMessageEvent>()
    this.#textMessageState.activeMessageId = null
    this.#lastValues = undefined
    this.#interrupts.clear()
    this.#emittedRunFinished = false
    return {
      aguiEvents: this.#aguiEvents,
      toolEvents: this.#toolEvents,
      customEvents: this.#customEvents,
      messageEvents: this.#messageEvents,
    }
  }

  get emittedRunFinished(): boolean {
    return this.#emittedRunFinished
  }

  process(event: ProtocolEvent): boolean {
    if (event.method === 'values') {
      const data = event.params.data
      if (data != null && typeof data === 'object' && !Array.isArray(data))
        this.#lastValues = data as Record<string, unknown>
    }

    if (event.method === 'tasks')
      this.collectTaskInterrupts(event)

    if (event.method === 'tools') {
      for (const aguiEvent of mapToolsEventDataToAgUi(event.params.data as ToolsEventData)) {
        this.#toolEvents.push(aguiEvent)
        this.#aguiEvents.push(aguiEvent)
      }
    }

    if (event.method === 'messages') {
      for (const aguiEvent of mapMessagesEventDataToAgUi(
        event.params.data as MessagesEventData,
        this.#textMessageState,
      )) {
        this.#messageEvents.push(aguiEvent)
        this.#aguiEvents.push(aguiEvent)
      }
    }

    if (event.method === 'custom')
      this.pushCustomEvent(event)

    return true
  }

  finalize(): void {
    const ctx = aguiRunContext.current
    if (this.#interrupts.size === 0 || ctx == null)
      return

    const finalizeOpts: BuildInterruptFinalizeOptions = {
      threadId: ctx.threadId,
      runId: ctx.runId,
      interrupts: [...this.#interrupts.values()],
      emitLegacyCustom: true,
      ...(this.#lastValues != null ? { snapshot: this.#lastValues } : {}),
    }
    const events = buildInterruptFinalizeEvents(finalizeOpts)

    for (const ev of events) {
      this.#aguiEvents.push(ev as AguiMappedEvent)
      if (ev.type === EventType.RUN_FINISHED)
        this.#emittedRunFinished = true
    }

    this.#interrupts.clear()
  }

  private collectTaskInterrupts(event: ProtocolEvent) {
    const data = event.params.data as TaskEventData | undefined
    const rawList = data?.interrupts
    if (!rawList?.length)
      return

    for (const item of rawList) {
      const interruptId = (item.interruptId ?? item.id)?.trim()
      if (!interruptId)
        continue
      const payload = item.payload !== undefined ? item.payload : item.value
      this.#interrupts.set(interruptId, { interruptId, payload })
    }
  }

  private pushCustomEvent(event: ProtocolEvent) {
    const raw = event.params.data
    const record = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : { payload: raw }
    const name = typeof record.name === 'string' ? record.name : 'custom'
    const value = 'payload' in record ? record.payload : record

    const custom: CustomEvent = {
      type: EventType.CUSTOM,
      name,
      value,
      timestamp: event.params.timestamp,
    }
    this.#customEvents.push(custom)
    this.#aguiEvents.push(custom)
  }
}

export function aguiTransformerFactory() {
  return new AguiTransformer()
}
