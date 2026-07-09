import type { ChatCompletionFunctionTool, ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions'

// ==========================================
// LlmDriver — LLM 后端抽象接口
// ==========================================

/**
 * LLM 后端统一接口
 *
 * chat() 通过 onEvent 回调推送流式事件,最终返回完整的 assistant 消息
 */
interface LlmDriver {
  chat: (
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionFunctionTool[] | undefined,
    onEvent: (event: LlmDriverEvent) => void,
  ) => Promise<ChatCompletionMessageParam>
}

// ==========================================
// Driver 事件
// ==========================================

interface LlmDriverEvent {
  type: 'text_delta' | 'reasoning_delta'
  content: string
}

export type { LlmDriver, LlmDriverEvent }
