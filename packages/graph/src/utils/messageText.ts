import type { BaseMessage } from '@langchain/core/messages'

/** 从 LangChain BaseMessage 提取纯文本 */
export function messageText(message: BaseMessage | undefined): string {
  if (!message)
    return ''
  const { content } = message
  if (typeof content === 'string')
    return content
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string')
        return part
      if (part && typeof part === 'object' && 'text' in part) {
        const text = (part as { text?: unknown }).text
        return typeof text === 'string' ? text : ''
      }
      return ''
    }).join('')
  }
  return ''
}
