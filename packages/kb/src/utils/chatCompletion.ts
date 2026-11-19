import type { ChatDeepSeekInput } from '@langchain/deepseek'
import type { z } from 'zod'
import { env } from '@agent/env'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatDeepSeek } from '@langchain/deepseek'

export interface ChatCompletionOptions {
  system: string
  user: string
  model?: string
  temperature?: number
}

/** 改写是内部 JSON。超时后退回原查询，避免一直占着 kb SSE。 */
const COMPLETION_TIMEOUT_MS = 90_000

/** LangGraph `messages` 流跳过带此 tag 的调用，避免改写 JSON 被当成对话正文打到前端。 */
const NOSTREAM_TAG = 'nostream'

export type KbChatModelOptions = Partial<ChatDeepSeekInput> & {
  /** DeepSeek V4 `thinking.type`。不传则用服务端默认。 */
  thinking?: 'enabled' | 'disabled'
}

export function createKbChatModel({ thinking, ...fields }: KbChatModelOptions = {}): ChatDeepSeek {
  return new ChatDeepSeek({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    configuration: { baseURL: env.OPENAI_BASE_URL },
    temperature: 0,
    ...fields,
    ...(thinking && { modelKwargs: { thinking: { type: thinking } } }),
  })
}

/** 整段返回。关掉思考，避免等整段 CoT 才写出第一个 kb 事件。 */
export async function chatCompletionText(options: ChatCompletionOptions): Promise<string> {
  const model = createKbChatModel({
    model: options.model ?? env.OPENAI_MODEL_MINI ?? env.OPENAI_MODEL,
    temperature: options.temperature ?? 0,
    thinking: 'disabled',
    timeout: COMPLETION_TIMEOUT_MS,
  })
  const response = await model.invoke(
    [new SystemMessage(options.system), new HumanMessage(options.user)],
    { tags: [NOSTREAM_TAG] },
  )
  return response.text
}

export async function chatCompletionJson<T extends Record<string, unknown>>(
  options: ChatCompletionOptions & { schema: z.ZodType<T>, fallback: T },
): Promise<T> {
  try {
    const model = createKbChatModel({
      model: options.model ?? env.OPENAI_MODEL_MINI ?? env.OPENAI_MODEL,
      temperature: options.temperature ?? 0,
      thinking: 'disabled',
      timeout: COMPLETION_TIMEOUT_MS,
    }).withStructuredOutput(options.schema)
    return await model.invoke(
      [new SystemMessage(options.system), new HumanMessage(options.user)],
      { tags: [NOSTREAM_TAG] },
    ) as T
  }
  catch {
    return options.fallback
  }
}
