/**
 * 直连 Chat Completions（非 LangChain）通用内核。
 * - silent：整段返回，不进 AG-UI（分类 / hunk 摘要）
 * - streamReasoning：流式；reasoning_* → AG-UI；content 只累积，不发 TEXT_MESSAGE_*
 */
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { EventType } from '@ag-ui/core'
import { AGUI_WRITER_EVENT } from '../stream/aguiTransformer'

export type ChatCompletionMode = 'silent' | 'streamReasoning'

function resolveOpenAiEnv(): { apiKey: string, base: string, model: string } {
  const apiKey = process.env.OPENAI_API_KEY ?? ''
  const base = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.OPENAI_MODEL ?? ''
  if (!apiKey || !model)
    throw new Error('OPENAI_API_KEY / OPENAI_MODEL 未配置')
  return { apiKey, base, model }
}

export async function runChatCompletion(
  config: LangGraphRunnableConfig | undefined,
  params: {
    system: string
    user: string
    temperature?: number
    mode: ChatCompletionMode
  },
): Promise<string> {
  const { apiKey, base, model } = resolveOpenAiEnv()
  const temperature = params.temperature ?? 0.7
  const stream = params.mode === 'streamReasoning'

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      stream,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`runChatCompletion(${params.mode}) ${res.status}: ${body.slice(0, 200)}`)
  }

  if (params.mode === 'silent') {
    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string | null } }>
    }
    return data.choices?.[0]?.message?.content?.trim() ?? ''
  }

  if (!res.body)
    throw new Error('runChatCompletion(streamReasoning): 无响应流')

  const writer = config?.writer
  const emit = (payload: unknown) => {
    if (writer)
      writer({ name: AGUI_WRITER_EVENT, payload })
  }

  const reasoningMessageId = `${randomUUID()}:reasoning:0`
  let reasoningStarted = false
  let content = ''

  const flushReasoningEnd = () => {
    if (!reasoningStarted)
      return
    emit({ type: EventType.REASONING_MESSAGE_END, messageId: reasoningMessageId })
    reasoningStarted = false
  }

  const onReasoningDelta = (delta: string) => {
    if (!delta)
      return
    if (!reasoningStarted) {
      emit({
        type: EventType.REASONING_MESSAGE_START,
        messageId: reasoningMessageId,
        role: 'reasoning',
      })
      reasoningStarted = true
    }
    emit({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: reasoningMessageId,
      delta,
    })
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line.startsWith('data:'))
        continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]')
        continue
      let parsed: {
        choices?: Array<{
          delta?: {
            content?: string | null
            reasoning_content?: string | null
            reasoning?: string | null
          }
        }>
      }
      try {
        parsed = JSON.parse(data) as typeof parsed
      }
      catch {
        continue
      }
      const delta = parsed.choices?.[0]?.delta
      if (!delta)
        continue
      const reasoning = delta.reasoning_content ?? delta.reasoning
      if (typeof reasoning === 'string' && reasoning)
        onReasoningDelta(reasoning)
      if (typeof delta.content === 'string' && delta.content)
        content += delta.content
    }
  }

  flushReasoningEnd()
  return content.trim()
}
