import type {
  CustomEvent,
  RunFinishedEvent,
  StateSnapshotEvent,
} from '@ag-ui/core'
import type {
  MessagesEventData,
  ProtocolEvent,
  StreamChannel,
  StreamTransformer,
  ToolsEventData,
} from '@langchain/langgraph'
import type { AguiReasoningEvent, AguiTextMessageEvent } from './mapMessagesToAgUi'
import type { AguiToolEvent } from './mapToolsToAgUi'
import { EventType } from '@ag-ui/core'
import { StreamChannel as StreamChannelImpl } from '@langchain/langgraph'
import { mapMessagesEventDataToAgUi } from './mapMessagesToAgUi'
import { mapToolsEventDataToAgUi } from './mapToolsToAgUi'

/** LangGraph `config.writer` 解包名（与 `@agent/claude-agent` 的 `AGUI_WRITER_EVENT` 一致） */
export const AGUI_WRITER_EVENT = 'agui'

export type AguiMappedEvent
  = | AguiToolEvent
    | AguiTextMessageEvent
    | AguiReasoningEvent
    | CustomEvent
    | StateSnapshotEvent
    | RunFinishedEvent

export interface AguiExtensions {
  aguiEvents: StreamChannel<AguiMappedEvent>
  toolEvents: StreamChannel<AguiToolEvent>
  customEvents: StreamChannel<CustomEvent>
  messageEvents: StreamChannel<AguiTextMessageEvent>
}

/**
 * 只映射过程事件（tools / messages / custom）。
 * interrupt / RUN_FINISHED 收尾由 server `streamGraphAguiEvents` 读 `stream.interrupted` 补发。
 */
export class AguiTransformer implements StreamTransformer<AguiExtensions> {
  #aguiEvents!: StreamChannel<AguiMappedEvent>
  #toolEvents!: StreamChannel<AguiToolEvent>
  #customEvents!: StreamChannel<CustomEvent>
  #messageEvents!: StreamChannel<AguiTextMessageEvent>
  readonly #textMessageState = {
    activeMessageId: null as string | null,
    activeReasoningMessageId: null as string | null,
  }

  init(): AguiExtensions {
    this.#aguiEvents = StreamChannelImpl.local<AguiMappedEvent>()
    this.#toolEvents = StreamChannelImpl.local<AguiToolEvent>()
    this.#customEvents = StreamChannelImpl.local<CustomEvent>()
    this.#messageEvents = StreamChannelImpl.local<AguiTextMessageEvent>()
    this.#textMessageState.activeMessageId = null
    this.#textMessageState.activeReasoningMessageId = null
    return {
      aguiEvents: this.#aguiEvents,
      toolEvents: this.#toolEvents,
      customEvents: this.#customEvents,
      messageEvents: this.#messageEvents,
    }
  }

  process(event: ProtocolEvent): boolean {
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
        this.#aguiEvents.push(aguiEvent)
        // reasoning 事件只进主通道；文本事件额外进 #messageEvents（保持其文本类型约束）
        if (aguiEvent.type === EventType.TEXT_MESSAGE_START
          || aguiEvent.type === EventType.TEXT_MESSAGE_CONTENT
          || aguiEvent.type === EventType.TEXT_MESSAGE_END) {
          this.#messageEvents.push(aguiEvent as AguiTextMessageEvent)
        }
      }
    }

    if (event.method === 'custom')
      this.pushCustomEvent(event)

    return true
  }

  private pushCustomEvent(event: ProtocolEvent) {
    const raw = event.params.data
    const record = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : { payload: raw }
    const name = typeof record.name === 'string' ? record.name : 'custom'
    const value = 'payload' in record ? record.payload : record

    if (name === AGUI_WRITER_EVENT && value != null && typeof value === 'object' && 'type' in value) {
      const aguiEvent = value as AguiMappedEvent
      this.#aguiEvents.push(aguiEvent)
      if (aguiEvent.type === EventType.TOOL_CALL_START
        || aguiEvent.type === EventType.TOOL_CALL_ARGS
        || aguiEvent.type === EventType.TOOL_CALL_END
        || aguiEvent.type === EventType.TOOL_CALL_RESULT
        || aguiEvent.type === EventType.TOOL_CALL_CHUNK) {
        this.#toolEvents.push(aguiEvent as AguiToolEvent)
      }
      if (aguiEvent.type === EventType.TEXT_MESSAGE_START
        || aguiEvent.type === EventType.TEXT_MESSAGE_CONTENT
        || aguiEvent.type === EventType.TEXT_MESSAGE_END) {
        this.#messageEvents.push(aguiEvent as AguiTextMessageEvent)
      }
      return
    }

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
