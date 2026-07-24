import type { BaseMessage } from '@langchain/core/messages'

export function lastUserMessage(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || message.getType() !== 'human')
      continue
    const content = message.content
    if (typeof content === 'string' && content.trim())
      return content.trim()
  }
  return ''
}
