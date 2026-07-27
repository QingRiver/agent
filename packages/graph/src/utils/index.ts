import type { AIMessage, ContentBlock } from '@langchain/core/messages'
import { match, P } from 'ts-pattern'

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
