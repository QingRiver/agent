import type { SDKPartialAssistantMessage } from '../sdk'
import { describe, expect, it } from 'vitest'
import { makeMessageChunkFromAnthropicEvent } from './anthropicStreamChunks'

function streamEvent(
  event: SDKPartialAssistantMessage['event'],
): SDKPartialAssistantMessage['event'] {
  return event
}

describe('makeMessageChunkFromAnthropicEvent', () => {
  it('tool_use start 产出 tool_call_chunks', () => {
    const made = makeMessageChunkFromAnthropicEvent(streamEvent({
      type: 'content_block_start',
      index: 1,
      content_block: {
        type: 'tool_use',
        id: 'call_00_abc',
        name: 'Read',
        input: {},
      },
    } as SDKPartialAssistantMessage['event']))

    expect(made).not.toBeNull()
    expect(made?.chunk.tool_call_chunks?.[0]).toMatchObject({
      id: 'call_00_abc',
      name: 'Read',
      args: '',
    })
  })

  it('input_json_delta 累积 args chunk', () => {
    const made = makeMessageChunkFromAnthropicEvent(streamEvent({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"a":1}' },
    }))

    expect(made?.chunk.tool_call_chunks?.[0]).toMatchObject({
      index: 1,
      args: '{"a":1}',
    })
  })
})
