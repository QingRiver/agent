import type { ToolCall } from '@langchain/core/messages/tool'
import type { SDKAssistantMessage, SDKUserMessage } from '../sdk'
import { AIMessage, ToolMessage } from '@langchain/core/messages'

function stringifyToolContent(content: unknown): string {
  if (typeof content === 'string')
    return content
  if (content == null)
    return ''
  return JSON.stringify(content)
}

/** SDK assistant 完整消息 → `AIMessage` */
export function sdkAssistantToAIMessage(message: SDKAssistantMessage): AIMessage {
  const blocks = message.message.content
  if (!Array.isArray(blocks)) {
    return new AIMessage({ id: message.message.id, content: '' })
  }

  const textParts: string[] = []
  const toolCalls: ToolCall[] = []

  for (const block of blocks) {
    if (block == null || typeof block !== 'object')
      continue
    const record = block as unknown as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string')
      textParts.push(record.text)
    if (record.type === 'tool_use'
      && typeof record.id === 'string'
      && typeof record.name === 'string') {
      toolCalls.push({
        id: record.id,
        name: record.name,
        args: (record.input ?? {}) as Record<string, unknown>,
        type: 'tool_call',
      })
    }
  }

  const text = textParts.join('')
  return new AIMessage({
    id: message.message.id,
    content: text || (blocks as unknown as AIMessage['content']),
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  })
}

interface ToolResultEntry {
  tool_use_id: string
  content: unknown
  is_error?: boolean | undefined
}

function collectToolResults(message: SDKUserMessage): ToolResultEntry[] {
  const seen = new Set<string>()
  const entries: ToolResultEntry[] = []

  const push = (toolUseId: string, content: unknown, isError?: boolean) => {
    if (seen.has(toolUseId))
      return
    seen.add(toolUseId)
    entries.push({ tool_use_id: toolUseId, content, is_error: isError })
  }

  const top = message.tool_use_result
  if (top != null && typeof top === 'object' && 'tool_use_id' in top) {
    const record = top as { tool_use_id: string, content?: unknown, is_error?: boolean }
    push(record.tool_use_id, record.content ?? top, record.is_error)
  }

  const content = message.message.content
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block == null || typeof block !== 'object')
        continue
      const record = block as unknown as Record<string, unknown>
      if (record.type === 'tool_result' && typeof record.tool_use_id === 'string') {
        push(
          record.tool_use_id,
          record.content ?? '',
          Boolean(record.is_error),
        )
      }
    }
  }

  return entries
}

/** SDK user tool_result → `ToolMessage[]`（按 `tool_use_id` 去重） */
export function sdkUserToToolMessages(message: SDKUserMessage): ToolMessage[] {
  return collectToolResults(message).map(entry => new ToolMessage({
    tool_call_id: entry.tool_use_id,
    content: stringifyToolContent(entry.content),
    status: entry.is_error ? 'error' : 'success',
  }))
}
