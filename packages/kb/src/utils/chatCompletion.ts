import type { z } from 'zod'
import process from 'node:process'
import { env } from '@agent/env'
import { parseLlmJson } from './llmJson'

export interface ChatCompletionOptions {
  system: string
  user: string
  model?: string
  temperature?: number
}

function resolveModel(model?: string): string {
  return model ?? process.env.OPENAI_MODEL_MINI ?? env.OPENAI_MODEL
}

/** 改写是内部 JSON。超时后退回原查询，避免一直占着 kb SSE。 */
const COMPLETION_TIMEOUT_MS = 90_000

function completionsUrl(): string {
  const base = env.OPENAI_BASE_URL.replace(/\/$/, '')
  return `${base}/chat/completions`
}

/**
 * 与对话 `runChatCompletion` 的 silent 相同：整段 JSON 返回。
 * 关掉思考，避免等整段 CoT 才写出第一个 kb 事件。
 * 不经过 LangChain，避免改写 JSON 被当成对话正文打到前端。
 */
export async function chatCompletionText(options: ChatCompletionOptions): Promise<string> {
  const response = await fetch(completionsUrl(), {
    method: 'POST',
    signal: AbortSignal.timeout(COMPLETION_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: resolveModel(options.model),
      temperature: options.temperature ?? 0,
      stream: false,
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: options.user },
      ],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`chat completion failed: ${response.status} ${text}`)
  }

  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  return json.choices?.[0]?.message?.content ?? ''
}

export async function chatCompletionJson<T>(
  options: ChatCompletionOptions & { schema: z.ZodType<T>, fallback: T },
): Promise<T> {
  try {
    const text = await chatCompletionText(options)
    return parseLlmJson(text, options.schema) ?? options.fallback
  }
  catch {
    return options.fallback
  }
}
