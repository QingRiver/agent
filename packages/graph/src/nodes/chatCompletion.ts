/**
 * 直连 Chat Completions（非 LangChain）通用内核。
 * - silent：整段返回（分类 / hunk 摘要 / 旁路改稿）
 * - streamReasoning：边读边把思考增量交给 onReasoningDelta，正文仍整段返回
 */
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import process from 'node:process'

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
  _config: LangGraphRunnableConfig | undefined,
  params: {
    system: string
    user: string
    temperature?: number
    mode: ChatCompletionMode
    /**
     * DeepSeek V4：`thinking.type`。
     * silent 默认 disabled；streamReasoning 默认 enabled。
     */
    thinking?: boolean
    /** 思考增量。正文不从这里出去，避免整篇改稿刷进对话。 */
    onReasoningDelta?: (delta: string) => void
  },
): Promise<string> {
  const { apiKey, base, model } = resolveOpenAiEnv()
  const temperature = params.temperature ?? 0.7
  const stream = params.mode === 'streamReasoning'
  const thinkingEnabled = params.thinking ?? params.mode === 'streamReasoning'

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
      thinking: { type: thinkingEnabled ? 'enabled' : 'disabled' },
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

  let content = ''
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
      const reasoning = typeof delta.reasoning_content === 'string'
        ? delta.reasoning_content
        : typeof delta.reasoning === 'string'
          ? delta.reasoning
          : ''
      if (reasoning)
        params.onReasoningDelta?.(reasoning)
      if (typeof delta.content === 'string' && delta.content)
        content += delta.content
    }
  }

  return content.trim()
}
