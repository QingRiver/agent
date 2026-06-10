import type { SDKAssistantMessage, SDKPartialAssistantMessage, SDKUserMessage } from '../sdk'
import { EventType } from '@ag-ui/core'
import { describe, expect, it } from 'vitest'
import { mapSdkMessageToAgUi } from './mapSdkToAgUi'
import { createClaudeAguiMapState } from './types'

function testUuid(n: number): SDKPartialAssistantMessage['uuid'] {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

function streamMessage(
  event: SDKPartialAssistantMessage['event'],
  uuid: number,
): SDKPartialAssistantMessage {
  return {
    type: 'stream_event',
    event,
    parent_tool_use_id: null,
    uuid: testUuid(uuid),
    session_id: 's1',
  }
}

describe('mapSdkMessageToAgUi', () => {
  it('assistant 文本块 → TEXT_MESSAGE_*', () => {
    const state = createClaudeAguiMapState()
    const message = {
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
    } as SDKAssistantMessage

    const events = mapSdkMessageToAgUi(message, state)
    expect(events).toHaveLength(3)
    expect(events[0]?.type).toBe(EventType.TEXT_MESSAGE_START)
    expect(events[1]).toMatchObject({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: '你好',
    })
    expect(events[2]?.type).toBe(EventType.TEXT_MESSAGE_END)
  })

  it('assistant tool_use → TOOL_CALL_*', () => {
    const state = createClaudeAguiMapState()
    const message = {
      type: 'assistant',
      message: {
        id: 'msg_2',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: 'toolu_01',
          name: 'Read',
          input: { file_path: '/tmp/a.txt' },
        }],
        model: 'claude',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    } as SDKAssistantMessage

    const events = mapSdkMessageToAgUi(message, state)
    expect(events.map(e => e.type)).toEqual([
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
    ])
    expect(events[0]).toMatchObject({
      toolCallId: 'toolu_01',
      toolCallName: 'Read',
    })
  })

  it('user tool_result → TOOL_CALL_RESULT', () => {
    const state = createClaudeAguiMapState()
    const message = {
      type: 'user',
      message: {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: 'toolu_01',
          content: 'file contents',
        }],
      },
      parent_tool_use_id: null,
    } as SDKUserMessage

    const events = mapSdkMessageToAgUi(message, state)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: 'toolu_01',
      content: 'file contents',
      role: 'tool',
    })
  })

  it('stream_event 文本流 → TEXT_MESSAGE_*', () => {
    const state = createClaudeAguiMapState()
    const messages: SDKPartialAssistantMessage[] = [
      streamMessage({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      } as SDKPartialAssistantMessage['event'], 1),
      streamMessage({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hi' },
      }, 2),
      streamMessage({ type: 'content_block_stop', index: 0 }, 3),
    ]

    const events = messages.flatMap(m => mapSdkMessageToAgUi(m, state))
    expect(events.map(e => e.type)).toEqual([
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
    ])
    expect(events[1]).toMatchObject({ delta: 'Hi' })
  })

  it('stream_event tool_use → START, 增量 ARGS, END（不在 start 时提前 END）', () => {
    const state = createClaudeAguiMapState()
    const messages: SDKPartialAssistantMessage[] = [
      streamMessage({
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'tool_use',
          id: 'call_00_abc',
          name: 'Read',
          input: {},
        },
      } as SDKPartialAssistantMessage['event'], 1),
      streamMessage({
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"file' },
      }, 2),
      streamMessage({
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '_path":"/tmp/a.txt"}' },
      }, 3),
      streamMessage({ type: 'content_block_stop', index: 1 }, 4),
    ]

    const events = messages.flatMap(m => mapSdkMessageToAgUi(m, state))
    expect(events.map(e => e.type)).toEqual([
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
    ])
    expect(events[0]).toMatchObject({
      toolCallId: 'call_00_abc',
      toolCallName: 'Read',
    })
    expect(events[1]).toMatchObject({ delta: '{"file' })
    expect(events[2]).toMatchObject({ delta: '_path":"/tmp/a.txt"}' })
  })
})
