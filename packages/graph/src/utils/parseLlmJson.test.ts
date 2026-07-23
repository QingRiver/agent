import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { extractJsonText, parseLlmJson } from './parseLlmJson'

describe('parseLlmJson', () => {
  it('parses bare json object', () => {
    const schema = z.object({ intent: z.enum(['ask', 'write']) })
    expect(parseLlmJson('{"intent":"write"}', schema)).toEqual({ intent: 'write' })
  })

  it('parses fenced json', () => {
    const schema = z.object({ summaries: z.array(z.string()) })
    const raw = '如下：\n```json\n{"summaries":["修正标点"]}\n```\n'
    expect(parseLlmJson(raw, schema)).toEqual({ summaries: ['修正标点'] })
  })

  it('extractJsonText finds embedded object', () => {
    expect(extractJsonText('intent is {"intent":"ask"} ok')).toBe('{"intent":"ask"}')
  })

  it('returns null on invalid', () => {
    const schema = z.object({ intent: z.enum(['ask', 'write']) })
    expect(parseLlmJson('not json', schema)).toBeNull()
  })
})
