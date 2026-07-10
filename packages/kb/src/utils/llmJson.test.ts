import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { extractJsonText, parseLlmJson } from './llmJson'

describe('llmJson', () => {
  it('extractJsonText 从 reasoning 前缀后提取 JSON', () => {
    const text = '我们判断后输出：{"isKbQuery":true,"reason":"政策"}'
    expect(extractJsonText(text)).toBe('{"isKbQuery":true,"reason":"政策"}')
  })

  it('parseLlmJson 解析 fenced JSON', () => {
    const schema = z.object({ queries: z.array(z.string()) })
    const parsed = parseLlmJson('```json\n{"queries":["电子发票"]}\n```', schema)
    expect(parsed).toEqual({ queries: ['电子发票'] })
  })
})
