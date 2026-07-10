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

/** 直接调用 OpenAI 兼容 API，不经过 LangChain，避免图内 streamEvents 泄漏到前端 */
export async function chatCompletionText(options: ChatCompletionOptions): Promise<string> {
  const baseUrl = env.OPENAI_BASE_URL.replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: resolveModel(options.model),
      temperature: options.temperature ?? 0,
      stream: false,
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
    choices?: Array<{ message?: { content?: string } }>
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
