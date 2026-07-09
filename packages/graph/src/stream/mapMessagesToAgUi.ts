import type {
  ReasoningMessageContentEvent,
  ReasoningMessageEndEvent,
  ReasoningMessageStartEvent,
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

/** AG-UI 推理/思考相关事件（`REASONING_MESSAGE_*`），对应 DeepSeek reasoning_content */
export type AguiReasoningEvent
  = | ReasoningMessageStartEvent
    | ReasoningMessageContentEvent
    | ReasoningMessageEndEvent

export interface TextMessageMapState {
  activeMessageId: string | null
  /** 当前进行中的 reasoning 块消息 id；null 表示无活动推理块 */
  activeReasoningMessageId: string | null
}

/** 为 reasoning 块生成稳定 messageId：依附所属消息 + 块 index */
function reasoningIdFor(state: TextMessageMapState, index: number): string {
  return `${state.activeMessageId ?? 'msg'}:reasoning:${index}`
}

/**
 * `MessagesEventData` → AG-UI 文本/推理消息事件。
 *
 * 文本块(`text-delta`)→ `TEXT_MESSAGE_*`；
 * 推理块(`reasoning` content-block + `reasoning-delta`)→ `REASONING_MESSAGE_*`，
 * 把 DeepSeek 的 reasoning_content 暴露为独立思考流，供 CopilotChat 原生渲染、
 * 供 writer 编辑器等自定义消费。所有 agent 共用此映射器，一处生效。
 */
export function mapMessagesEventDataToAgUi(
  data: MessagesEventData,
  state: TextMessageMapState,
): (AguiTextMessageEvent | AguiReasoningEvent)[] {
  switch (data.event) {
    case 'message-start': {
      state.activeMessageId = data.id
      return [{
        type: EventType.TEXT_MESSAGE_START,
        messageId: data.id,
        role: 'assistant',
      }]
    }
    case 'content-block-start': {
      // 只对 reasoning 块开一个独立思考消息；text 块由 message-start + text-delta 隐式承载
      if (data.content.type !== 'reasoning')
        return []
      const messageId = reasoningIdFor(state, data.index)
      state.activeReasoningMessageId = messageId
      return [{
        type: EventType.REASONING_MESSAGE_START,
        messageId,
        role: 'reasoning',
      }]
    }
    case 'content-block-delta': {
      if (data.delta.type === 'text-delta') {
        if (!state.activeMessageId)
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
      if (data.delta.type === 'reasoning-delta') {
        const reasoning = data.delta.reasoning
        if (!reasoning)
          return []
        // 防御：缺少 content-block-start 时按 index 隐式开一个思考消息
        if (!state.activeReasoningMessageId)
          state.activeReasoningMessageId = reasoningIdFor(state, data.index)
        return [{
          type: EventType.REASONING_MESSAGE_CONTENT,
          messageId: state.activeReasoningMessageId,
          delta: reasoning,
        }]
      }
      return []
    }
    case 'content-block-finish': {
      if (data.content.type !== 'reasoning' || !state.activeReasoningMessageId)
        return []
      const messageId = state.activeReasoningMessageId
      state.activeReasoningMessageId = null
      return [{ type: EventType.REASONING_MESSAGE_END, messageId }]
    }
    case 'message-finish': {
      const events: (AguiTextMessageEvent | AguiReasoningEvent)[] = []
      // 兜底：reasoning 块未发 END 的在此补发
      if (state.activeReasoningMessageId) {
        events.push({ type: EventType.REASONING_MESSAGE_END, messageId: state.activeReasoningMessageId })
        state.activeReasoningMessageId = null
      }
      if (state.activeMessageId) {
        events.push({ type: EventType.TEXT_MESSAGE_END, messageId: state.activeMessageId })
        state.activeMessageId = null
      }
      return events
    }
    default:
      return []
  }
}
