import type {
  ToolMessage as AgUiToolMessage,
  AssistantMessage,
  Message,
  ToolCall,
  UserMessage,
} from '@ag-ui/core'
import type { GraphsName } from '@agent/graph'
import type { BaseMessage } from '@langchain/core/messages'
import type { ToolCall as LangChainToolCall } from '@langchain/core/messages/tool'
import { randomUUID } from 'node:crypto'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'

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

function langChainToolCallToAgUi(call: LangChainToolCall): ToolCall {
  return {
    id: call.id ?? randomUUID(),
    type: 'function',
    function: {
      name: call.name,
      arguments: typeof call.args === 'string'
        ? call.args
        : JSON.stringify(call.args ?? {}),
    },
  }
}

/** LangChain checkpoint `BaseMessage` → AG-UI `Message`（connect snapshot 与 REST hydrate 共用） */
export function baseMessageToAgUiMessage(msg: BaseMessage): Message | null {
  const id = msg.id ?? randomUUID()

  if (HumanMessage.isInstance(msg)) {
    const userMessage: UserMessage = {
      id,
      role: 'user',
      content: stringifyMessageContent(msg.content),
    }
    return userMessage
  }

  if (AIMessage.isInstance(msg)) {
    const assistantMessage: AssistantMessage = {
      id,
      role: 'assistant',
      content: stringifyMessageContent(msg.content),
    }
    if (msg.tool_calls?.length)
      assistantMessage.toolCalls = msg.tool_calls.map(langChainToolCallToAgUi)
    return assistantMessage
  }

  if (ToolMessage.isInstance(msg)) {
    const toolCallId = msg.tool_call_id
    if (!toolCallId)
      return null
    const toolMessage: AgUiToolMessage = {
      id,
      role: 'tool',
      content: stringifyMessageContent(msg.content),
      toolCallId,
    }
    return toolMessage
  }

  return {
    id,
    role: msg.type,
    content: stringifyMessageContent(msg.content),
  } as Message
}

function isBaseMessage(value: unknown): value is BaseMessage {
  return value != null
    && typeof value === 'object'
    && 'content' in value
    && typeof (value as BaseMessage).type === 'string'
}

export function mapStateToAgUiMessages(
  _graphsName: GraphsName,
  values: Record<string, unknown>,
): Message[] {
  const raw = values.messages
  if (!Array.isArray(raw))
    return []

  const messages: Message[] = []
  for (const item of raw) {
    if (!isBaseMessage(item))
      continue
    const mapped = baseMessageToAgUiMessage(item)
    if (mapped)
      messages.push(mapped)
  }
  return messages
}
