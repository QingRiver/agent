import type {
  TextMessageContentEvent,
  TextMessageEndEvent,
  TextMessageStartEvent,
} from '@ag-ui/core'
import type { MessagesEventData } from '@langchain/langgraph'
import { EventType } from '@ag-ui/core'

/** AG-UI 文本消息相关事件（`TEXT_MESSAGE_*`） */
export type AguiTextMessageEvent
  = | TextMessageStartEvent
    | TextMessageContentEvent
    | TextMessageEndEvent

export interface TextMessageMapState {
  activeMessageId: string | null
}

/** `MessagesEventData` → AG-UI 文本消息事件（需维护 `state.activeMessageId`） */
export function mapMessagesEventDataToAgUi(
  data: MessagesEventData,
  state: TextMessageMapState,
): AguiTextMessageEvent[] {
  switch (data.event) {
    case 'message-start': {
      state.activeMessageId = data.id
      return [{
        type: EventType.TEXT_MESSAGE_START,
        messageId: data.id,
        role: 'assistant',
      }]
    }
    case 'content-block-delta': {
      if (data.delta.type !== 'text-delta' || !state.activeMessageId)
        return []
      const { text } = data.delta
      if (!text)
        return []
      return [{
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: state.activeMessageId,
        delta: text,
      }]
    }
    case 'message-finish': {
      if (!state.activeMessageId)
        return []
      const messageId = state.activeMessageId
      state.activeMessageId = null
      return [{ type: EventType.TEXT_MESSAGE_END, messageId }]
    }
    default:
      return []
  }
}
