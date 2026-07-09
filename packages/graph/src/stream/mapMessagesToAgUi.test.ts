import type { MessagesEventData } from '@langchain/langgraph'
import type { TextMessageMapState } from './mapMessagesToAgUi'
import { EventType } from '@ag-ui/core'
import { describe, expect, it } from 'vitest'
import { mapMessagesEventDataToAgUi } from './mapMessagesToAgUi'

function state(): TextMessageMapState {
  return { activeMessageId: null, activeReasoningMessageId: null }
}

function run(data: unknown, st = state()) {
  return { st, events: mapMessagesEventDataToAgUi(data as MessagesEventData, st) }
}

describe('mapMessagesEventDataToAgUi — 文本流', () => {
  it('message-start → TEXT_MESSAGE_START，记录 activeMessageId', () => {
    const { st, events } = run({ event: 'message-start', role: 'assistant', id: 'm1' })
    expect(events).toEqual([{ type: EventType.TEXT_MESSAGE_START, messageId: 'm1', role: 'assistant' }])
    expect(st.activeMessageId).toBe('m1')
  })

  it('content-block-delta text-delta → TEXT_MESSAGE_CONTENT', () => {
    const { events } = run({ event: 'content-block-delta', index: 1, delta: { type: 'text-delta', text: '你好' } }, { activeMessageId: 'm1', activeReasoningMessageId: null })
    expect(events).toEqual([{ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: '你好' }])
  })

  it('空 text-delta 不发事件', () => {
    const { events } = run({ event: 'content-block-delta', index: 1, delta: { type: 'text-delta', text: '' } }, { activeMessageId: 'm1', activeReasoningMessageId: null })
    expect(events).toEqual([])
  })
})

describe('mapMessagesEventDataToAgUi — reasoning 流', () => {
  it('reasoning content-block-start → REASONING_MESSAGE_START', () => {
    const st = { activeMessageId: 'm1', activeReasoningMessageId: null }
    const { events } = run({ event: 'content-block-start', index: 0, content: { type: 'reasoning', reasoning: '' } }, st)
    expect(events).toEqual([{ type: EventType.REASONING_MESSAGE_START, messageId: 'm1:reasoning:0', role: 'reasoning' }])
    expect(st.activeReasoningMessageId).toBe('m1:reasoning:0')
  })

  it('reasoning-delta → REASONING_MESSAGE_CONTENT，累积到同一 messageId', () => {
    const st = { activeMessageId: 'm1', activeReasoningMessageId: 'm1:reasoning:0' }
    const { events } = run({ event: 'content-block-delta', index: 0, delta: { type: 'reasoning-delta', reasoning: '先想想' } }, st)
    expect(events).toEqual([{ type: EventType.REASONING_MESSAGE_CONTENT, messageId: 'm1:reasoning:0', delta: '先想想' }])
  })

  it('content-block-finish(reasoning) → REASONING_MESSAGE_END 并清空', () => {
    const st = { activeMessageId: 'm1', activeReasoningMessageId: 'm1:reasoning:0' }
    const { events } = run({ event: 'content-block-finish', index: 0, content: { type: 'reasoning', reasoning: '先想想' } }, st)
    expect(events).toEqual([{ type: EventType.REASONING_MESSAGE_END, messageId: 'm1:reasoning:0' }])
    expect(st.activeReasoningMessageId).toBeNull()
  })

  it('text content-block-start 不触发 reasoning 事件', () => {
    const { events } = run({ event: 'content-block-start', index: 1, content: { type: 'text', text: '' } }, { activeMessageId: 'm1', activeReasoningMessageId: null })
    expect(events).toEqual([])
  })

  it('缺 content-block-start 时 reasoning-delta 隐式开一个思考消息', () => {
    const st = { activeMessageId: 'm1', activeReasoningMessageId: null }
    const { events } = run({ event: 'content-block-delta', index: 0, delta: { type: 'reasoning-delta', reasoning: 'x' } }, st)
    expect(events[0]).toMatchObject({ type: EventType.REASONING_MESSAGE_CONTENT, messageId: 'm1:reasoning:0', delta: 'x' })
    expect(st.activeReasoningMessageId).toBe('m1:reasoning:0')
  })
})

describe('mapMessagesEventDataToAgUi — message-finish 兜底', () => {
  it('reasoning 未 END 时 message-finish 补发 REASONING_MESSAGE_END + TEXT_MESSAGE_END', () => {
    const st = { activeMessageId: 'm1', activeReasoningMessageId: 'm1:reasoning:0' }
    const { events } = run({ event: 'message-finish' }, st)
    expect(events).toEqual([
      { type: EventType.REASONING_MESSAGE_END, messageId: 'm1:reasoning:0' },
      { type: EventType.TEXT_MESSAGE_END, messageId: 'm1' },
    ])
    expect(st.activeMessageId).toBeNull()
    expect(st.activeReasoningMessageId).toBeNull()
  })
})
