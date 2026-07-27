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

/** 取最后一条非空人类消息的 trim 文本；向前跳过空内容，找不到返回 '' */
export function lastHumanMessageText(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || message.getType() !== 'human')
      continue
    const text = messageText(message).trim()
    if (text)
      return text
  }
  return ''
}
