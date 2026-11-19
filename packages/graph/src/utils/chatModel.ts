import type { ChatDeepSeekInput } from '@langchain/deepseek'
import { env } from '@agent/env'
import { ChatDeepSeek } from '@langchain/deepseek'

/** LangGraph `messages` 流跳过带此 tag 的模型调用。内部 JSON、整篇改稿都不该刷进对话。 */
export const NOSTREAM_TAG = 'nostream'

export type ChatModelOptions = Partial<ChatDeepSeekInput> & {
  /** DeepSeek V4 `thinking.type`。不传则用服务端默认。 */
  thinking?: 'enabled' | 'disabled'
}

/** 换厂商须用对应的 provider 类：gateway 发 `contentBlocks`，ChatOpenAI 不认 DeepSeek 的思考字段。 */
export function createChatModel({ thinking, ...fields }: ChatModelOptions = {}): ChatDeepSeek {
  return new ChatDeepSeek({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    configuration: { baseURL: env.OPENAI_BASE_URL },
    ...fields,
    ...(thinking && { modelKwargs: { thinking: { type: thinking } } }),
  })
}
