/** 移除 undefined，避免 CopilotKit / fast-json-patch 抛出 OPERATION_VALUE_CANNOT_CONTAIN_UNDEFINED */
export function sanitizeForAgui(value: unknown): unknown {
  if (value === undefined)
    return null
  if (value === null || typeof value !== 'object')
    return value
  if (Array.isArray(value))
    return value.map(item => sanitizeForAgui(item))
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value)) {
    if (val !== undefined)
      out[key] = sanitizeForAgui(val)
  }
  return out
}
