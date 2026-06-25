import type { LlmDriverEvent } from '@core/driver/types'
import { describe, expect, it, vi } from 'vitest'

const createMock = vi.fn()

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: createMock,
      },
    }
  },
}))

vi.mock('@agent/env', () => ({
  env: {
    OPENAI_BASE_URL: 'http://test',
    OPENAI_API_KEY: 'test-key',
    OPENAI_MODEL: 'test-model',
  },
}))

const { OpenAIDriver } = await import('./openai')

describe('openAIDriver', () => {
  it('streams text deltas and returns assistant message', async () => {
    async function* stream() {
      yield { choices: [{ delta: { content: 'Hello' } }] }
      yield { choices: [{ delta: { content: ' world' } }] }
    }
    createMock.mockResolvedValue(stream())

    const driver = new OpenAIDriver()
    const events: LlmDriverEvent[] = []
    const result = await driver.chat([], undefined, e => events.push(e))

    expect(events).toEqual([
      { type: 'text_delta', content: 'Hello' },
      { type: 'text_delta', content: ' world' },
    ])
    expect(result).toEqual({ role: 'assistant', content: 'Hello world' })
  })

  it('assembles streamed function tool_calls', async () => {
    async function* stream() {
      yield {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":"' },
            }],
          },
        }],
      }
      yield {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: { arguments: 'Beijing"}' },
            }],
          },
        }],
      }
    }
    createMock.mockResolvedValue(stream())

    const driver = new OpenAIDriver()
    const result = await driver.chat([], undefined, () => {})

    expect(result).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: 'call_1',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"city":"Beijing"}' },
      }],
    })
  })
})
