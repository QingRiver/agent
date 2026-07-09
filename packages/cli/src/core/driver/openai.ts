import type { LlmDriver, LlmDriverEvent } from '@core/driver/types'
import type { ChatCompletionFunctionTool, ChatCompletionMessageFunctionToolCall, ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions'
import { env } from '@agent/env'
import OpenAI from 'openai'

// ==========================================
// OpenAI Driver 实现
// ==========================================

class OpenAIDriver implements LlmDriver {
  #client = new OpenAI({
    baseURL: env.OPENAI_BASE_URL,
    apiKey: env.OPENAI_API_KEY,
  })

  async chat(
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionFunctionTool[] | undefined,
    onEvent: (event: LlmDriverEvent) => void,
  ): Promise<ChatCompletionMessageParam> {
    const streamParams: OpenAI.ChatCompletionCreateParamsStreaming = {
      model: env.OPENAI_MODEL,
      messages,
      stream: true,
    }

    if (tools?.length) {
      streamParams.tools = tools
    }

    const stream = await this.#client.chat.completions.create(streamParams)

    let content = ''
    let reasoning = ''
    const toolCallAcc = new Map<number, ChatCompletionMessageFunctionToolCall>()

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (!delta) {
        continue
      }

      if (delta.content) {
        content += delta.content
        onEvent({ type: 'text_delta', content: delta.content })
      }

      // DeepSeek-v4 thinking 模式的 reasoning_content:实时流出 + 累积回传,避多轮 400
      const rc = (delta as { reasoning_content?: string }).reasoning_content
      if (rc) {
        reasoning += rc
        onEvent({ type: 'reasoning_delta', content: rc })
      }

      for (const tc of delta.tool_calls ?? []) {
        let prev = toolCallAcc.get(tc.index)
        if (!prev) {
          prev = { id: '', type: 'function', function: { name: '', arguments: '' } }
          toolCallAcc.set(tc.index, prev)
        }
        prev.id = tc.id ?? prev.id
        prev.function.name = tc.function?.name ?? prev.function.name
        prev.function.arguments += tc.function?.arguments ?? ''
      }
    }

    const toolCalls = [...toolCallAcc]
      .sort(([a], [b]) => a - b)
      .map(([, tc]) => tc)
      .filter(tc => tc.id !== '' && tc.function.name !== '')

    // 回传 reasoning_content:DeepSeek thinking 多轮要求 assistant 消息带 reasoning_content,
    // 否则第二轮起报 400 "reasoning_content in the thinking mode must be passed back"。
    const assistant: Record<string, unknown> = toolCalls.length > 0
      ? { role: 'assistant', content: content || null, tool_calls: toolCalls }
      : { role: 'assistant', content: content || null }
    if (reasoning)
      assistant.reasoning_content = reasoning
    return assistant as unknown as ChatCompletionMessageParam
  }
}

export { OpenAIDriver }
