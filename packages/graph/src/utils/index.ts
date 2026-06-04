import type { ContentBlock } from '@langchain/core/messages'
import { AIMessage } from '@langchain/core/messages'
import { FakeListChatModel } from '@langchain/core/utils/testing'
import { isString } from 'radash'
import { match, P } from 'ts-pattern'

/**
 * 伪装成大模型流式吐出文本的工具
 * @param text 你想流式吐出的文本
 * @param disableStreaming 是否禁用流式吐出，默认 false
 * @returns 大模型返回的 {@link AIMessage} 对象
 */
export async function llmLog(
  text: string,
  disableStreaming = true,
): Promise<AIMessage> {
  const wrapperModel = new FakeListChatModel({
    responses: [text],
    disableStreaming,
  })
  return await wrapperModel.invoke([])
}

export function getAIMessageContent(message: AIMessage) {
  return match(message.content)
    .with(P.string, c => c)
    .with(
      P.when((content): content is ContentBlock.Standard[] => Array.isArray(content)),
      blocks =>
        blocks
          .filter((block): block is ContentBlock.Text => block.type === 'text')
          .map(block => block.text)
          .join(''),
    )
    .otherwise(() => {
      throw new Error('Unsupported message content type')
    })
}

/** 将图状态里的 messages（string 或 AIMessage）统一成 string[] */
export function normalizeMessages(input: { messages: unknown[] }) {
  return {
    messages: input.messages.map((message) => {
      if (isString(message))
        return message
      if (AIMessage.isInstance(message))
        return getAIMessageContent(message)
      throw new Error('Unsupported message type')
    }),
  }
}
