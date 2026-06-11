import type { SDKMessage } from '../sdk'
import { EventType } from '@ag-ui/core'
import { AIMessage } from '@langchain/core/messages'
import { describe, expect, it, vi } from 'vitest'
import { query } from '../sdk'

import { AGUI_WRITER_EVENT, runQueryInGraphNode } from './runQueryInGraphNode'

vi.mock('../sdk', () => ({
  query: vi.fn(),
}))

vi.mock('../config', () => ({
  claudePackageQueryOptions: () => ({}),
}))

const mockQuery = vi.mocked(query)

describe('runQueryInGraphNode', () => {
  it('writer 收到 agui 事件并返回 messages + sessionId', async () => {
    const messages: SDKMessage[] = [
      {
        type: 'assistant',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: '你好' }],
          model: 'claude',
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      } as SDKMessage,
      {
        type: 'result',
        subtype: 'success',
        result: '你好',
        session_id: 'sess-abc',
        duration_ms: 1,
        duration_api_ms: 1,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0,
        usage: { input_tokens: 1, output_tokens: 1 },
      } as SDKMessage,
    ]

    mockQuery.mockReturnValue((async function* () {
      for (const m of messages)
        yield m
    })() as ReturnType<typeof query>)

    const written: unknown[] = []
    const result = await runQueryInGraphNode({
      prompt: '你好',
      writer: payload => written.push(payload),
    })

    expect(result.claudeSessionId).toBe('sess-abc')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]).toBeInstanceOf(AIMessage)
    expect(written.some(
      e => (e as { name: string }).name === AGUI_WRITER_EVENT
        && (e as { payload: { type: string } }).payload.type === EventType.TEXT_MESSAGE_START,
    )).toBe(true)
  })

  it('result 失败时抛错', async () => {
    mockQuery.mockReturnValue((async function* () {
      yield {
        type: 'result',
        subtype: 'error_during_execution',
        errors: ['auth failed'],
        session_id: 'sess-x',
        duration_ms: 1,
        duration_api_ms: 1,
        is_error: true,
        num_turns: 0,
        total_cost_usd: 0,
        usage: { input_tokens: 0, output_tokens: 0 },
        stop_reason: null,
        modelUsage: {},
        permission_denials: [],
        uuid: '00000000-0000-4000-8000-000000000099',
      } as unknown as SDKMessage
    })() as ReturnType<typeof query>)

    await expect(runQueryInGraphNode({ prompt: 'x' })).rejects.toThrow('auth failed')
  })
})
