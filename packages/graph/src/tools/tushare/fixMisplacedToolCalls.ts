import type { AIMessage } from '@langchain/core/messages'
import { randomUUID } from 'node:crypto'

/**
 * DeepSeek-v4-flash 在 streamEvents 模式下被 langchain 错置进 content 的 tool_call 块。
 * 特征：type 标为 "text"，但同时带 name/args/id。
 */
interface MisplacedToolCallPart {
  type: 'text'
  text?: string
  name: string
  args: unknown
  id?: string
}

function isMisplacedToolCall(part: unknown): part is MisplacedToolCallPart {
  if (typeof part !== 'object' || part === null)
    return false
  const p = part as Record<string, unknown>
  return p.type === 'text' && typeof p.name === 'string' && 'args' in p
}

function parseToolArgs(args: unknown): Record<string, unknown> {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args) as Record<string, unknown>
    }
    catch {
      return { raw: args }
    }
  }
  return (args && typeof args === 'object' ? args : {}) as Record<string, unknown>
}

/**
 * 从 content 数组提取误放的 tool_call 重建 tool_calls；
 * 正常模型已有 tool_calls 时跳过。
 */
export function fixMisplacedToolCalls(response: AIMessage): AIMessage {
  if (response.tool_calls?.length || !Array.isArray(response.content))
    return response

  const toolCalls: NonNullable<AIMessage['tool_calls']> = []

  const cleanedContent = response.content.map((part) => {
    if (isMisplacedToolCall(part)) {
      toolCalls.push({
        id: part.id ?? `call_${randomUUID()}`,
        name: part.name,
        args: parseToolArgs(part.args),
        type: 'tool_call',
      })
      return { type: 'text' as const, text: part.text ?? '' }
    }
    return part
  })

  if (toolCalls.length === 0)
    return response

  response.content = cleanedContent
  response.tool_calls = toolCalls
  return response
}
