import type { BaseMessage } from '@langchain/core/messages'
import type { AgentId, AgUiMessage } from '../../shared/conversation'
import { randomUUID } from 'node:crypto'
import { AIMessage, HumanMessage } from '@langchain/core/messages'

function stringifyMessageContent(content: BaseMessage['content']): string {
  if (typeof content === 'string')
    return content
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string')
          return block
        if (block && typeof block === 'object' && 'text' in block)
          return String((block as { text?: string }).text ?? '')
        return ''
      })
      .join('')
  }
  return String(content ?? '')
}

function baseMessageToAgUi(msg: BaseMessage): AgUiMessage {
  const role = HumanMessage.isInstance(msg)
    ? 'user'
    : AIMessage.isInstance(msg)
      ? 'assistant'
      : msg.type
  return {
    id: msg.id ?? randomUUID(),
    role,
    content: stringifyMessageContent(msg.content),
  }
}

function isBaseMessage(value: unknown): value is BaseMessage {
  return value != null
    && typeof value === 'object'
    && 'content' in value
    && typeof (value as BaseMessage).type === 'string'
}

export function mapStateToAgUiMessages(
  _agentId: AgentId,
  values: Record<string, unknown>,
): AgUiMessage[] {
  const raw = values.messages
  if (!Array.isArray(raw))
    return []

  return raw.filter(isBaseMessage).map(baseMessageToAgUi)
}
