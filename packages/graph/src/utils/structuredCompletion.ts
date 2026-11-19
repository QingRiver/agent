/**
 * 内部结构化补全：withStructuredOutput + nostream，不进对话 messages 流。
 */
import type { z } from 'zod'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createChatModel, NOSTREAM_TAG } from './chatModel'

export async function structuredCompletion<T extends Record<string, unknown>>(params: {
  system: string
  user: string
  schema: z.ZodType<T>
  temperature?: number
}): Promise<T | null> {
  try {
    const model = createChatModel({
      temperature: params.temperature ?? 0,
      thinking: 'disabled',
    }).withStructuredOutput(params.schema)
    return await model.invoke(
      [new SystemMessage(params.system), new HumanMessage(params.user)],
      { tags: [NOSTREAM_TAG] },
    ) as T
  }
  catch {
    return null
  }
}
