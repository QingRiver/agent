import type { ProtocolEvent } from '@langchain/langgraph'
import type { AguiMappedEvent } from './aguiTransformer'
import { EventType } from '@ag-ui/core'
import { describe, expect, it } from 'vitest'
import { AGUI_WRITER_EVENT, AguiTransformer } from './aguiTransformer'

function captureAguiEvents(transformer: AguiTransformer) {
  const extensions = transformer.init()
  const captured: AguiMappedEvent[] = []
  const originalPush = extensions.aguiEvents.push.bind(extensions.aguiEvents)
  extensions.aguiEvents.push = (event: AguiMappedEvent) => {
    captured.push(event)
    return originalPush(event)
  }
  return { extensions, captured }
}

describe('aguiTransformer agui custom unwrap', () => {
  it('解包 name=agui 为原生 TEXT_MESSAGE_* 而非 CUSTOM', () => {
    const transformer = new AguiTransformer()
    const { captured } = captureAguiEvents(transformer)

    const event = {
      method: 'custom',
      params: {
        namespace: ['claude_agent'],
        data: {
          name: AGUI_WRITER_EVENT,
          payload: {
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'msg-1',
            role: 'assistant',
          },
        },
        timestamp: Date.now(),
      },
    } as ProtocolEvent

    transformer.process(event)

    expect(captured).toHaveLength(1)
    expect(captured[0]?.type).toBe(EventType.TEXT_MESSAGE_START)
    expect(captured.some(e => e.type === EventType.CUSTOM)).toBe(false)
  })

  it('解包 TOOL_CALL_START 到 toolEvents', () => {
    const transformer = new AguiTransformer()
    const { extensions, captured } = captureAguiEvents(transformer)
    const toolCaptured: AguiMappedEvent[] = []
    const originalToolPush = extensions.toolEvents.push.bind(extensions.toolEvents)
    extensions.toolEvents.push = (event) => {
      toolCaptured.push(event)
      return originalToolPush(event)
    }

    transformer.process({
      method: 'custom',
      params: {
        namespace: ['claude_agent'],
        data: {
          name: AGUI_WRITER_EVENT,
          payload: {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'call_1',
            toolCallName: 'Read',
          },
        },
        timestamp: Date.now(),
      },
    } as ProtocolEvent)

    expect(captured[0]?.type).toBe(EventType.TOOL_CALL_START)
    expect(toolCaptured[0]?.type).toBe(EventType.TOOL_CALL_START)
  })
})
