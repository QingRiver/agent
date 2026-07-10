import { EventType } from '@ag-ui/core'
import { describe, expect, it } from 'vitest'
import { writeAguiAssistantText } from './writeAguiAssistantText'

describe('writeAguiAssistantText', () => {
  it('经 config.writer 推送 TEXT_MESSAGE_*', () => {
    const payloads: unknown[] = []
    writeAguiAssistantText({
      writer: ({ payload }: { payload: unknown }) => { payloads.push(payload) },
    } as never, '测试回复')

    expect(payloads).toEqual([
      expect.objectContaining({ type: EventType.TEXT_MESSAGE_START, role: 'assistant' }),
      expect.objectContaining({ type: EventType.TEXT_MESSAGE_CONTENT, delta: '测试回复' }),
      expect.objectContaining({ type: EventType.TEXT_MESSAGE_END }),
    ])
  })
})
