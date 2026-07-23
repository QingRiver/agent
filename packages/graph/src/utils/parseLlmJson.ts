import type { z } from 'zod'

/** 从模型输出中抽出首个 JSON 对象/数组（兼容 ```json 围栏与前后废话） */
export function extractJsonText(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed)
    return null

  const fenceOpen = trimmed.match(/^```(?:json)?\r?\n?/i)
  let candidate = trimmed
  if (fenceOpen) {
    const after = trimmed.slice(fenceOpen[0].length)
    const closeIdx = after.search(/\r?\n```/)
    candidate = (closeIdx >= 0 ? after.slice(0, closeIdx) : after).trim()
  }
  else {
    candidate = trimmed
  }

  const objStart = candidate.indexOf('{')
  const arrStart = candidate.indexOf('[')
  let start = -1
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart))
    start = objStart
  else if (arrStart >= 0)
    start = arrStart
  if (start < 0)
    return null

  const open = candidate[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i]
    if (ch === open)
      depth++
    else if (ch === close)
      depth--
    if (depth === 0)
      return candidate.slice(start, i + 1)
  }
  return null
}

export function parseLlmJson<T>(raw: string, schema: z.ZodType<T>): T | null {
  const jsonText = extractJsonText(raw)
  if (!jsonText)
    return null
  try {
    const parsed: unknown = JSON.parse(jsonText)
    const result = schema.safeParse(parsed)
    return result.success ? result.data : null
  }
  catch {
    return null
  }
}
