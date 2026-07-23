import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { EventType } from '@ag-ui/core'
import { AGUI_WRITER_EVENT } from '../stream/aguiTransformer'

/**
 * Document 改稿专用：直连流式 Completions。
 * - reasoning_content → AG-UI REASONING_MESSAGE_*（聊天里可展示思考）
 * - content 只累积返回，**不**发 TEXT_MESSAGE_*（避免全文刷屏）
 */
export async function streamDocumentCompletion(
  config: LangGraphRunnableConfig,
  params: {
    system: string
    user: string
    temperature?: number
  },
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY ?? ''
  const base = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.OPENAI_MODEL ?? ''
  if (!apiKey || !model)
    throw new Error('OPENAI_API_KEY / OPENAI_MODEL 未配置')

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: params.temperature ?? 0.7,
      stream: true,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`streamDocumentCompletion ${res.status}: ${body.slice(0, 200)}`)
  }
  if (!res.body)
    throw new Error('streamDocumentCompletion: 无响应流')

  const writer = config.writer
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
