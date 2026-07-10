import type { BaseMessage } from '@langchain/core/messages'
import type { z } from 'zod'

export function messageContentToString(content: BaseMessage['content']): string {
  if (typeof content === 'string')
    return content
  if (Array.isArray(content))
    return content.map(part => typeof part === 'string' ? part : JSON.stringify(part)).join('')
  return JSON.stringify(content)
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```'))
    return trimmed
  const lines = trimmed.split('\n')
  if (lines.length < 2)
    return trimmed
  const last = lines.at(-1)?.trim()
  if (last !== '```')
    return trimmed
  return lines.slice(1, -1).join('\n').trim()
}

/** 从含 reasoning 前缀或多余文字的模型输出中提取 JSON 对象/数组 */
export function extractJsonText(text: string): string {
  const stripped = stripJsonFence(text)
  const start = stripped.search(/[{[]/)
  if (start < 0)
    return stripped
  const open = stripped[start]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"')
        inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === open)
      depth++
    else if (ch === close)
      depth--
    if (depth === 0)
      return stripped.slice(start, i + 1)
  }
  return stripped.slice(start)
}

export function parseLlmJson<T>(text: string, schema: z.ZodType<T>): T | null {
  try {
    return schema.parse(JSON.parse(extractJsonText(text)))
  }
  catch {
    return null
  }
}
