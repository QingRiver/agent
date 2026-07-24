import { randomUUID } from 'node:crypto'
import { EventType } from '@ag-ui/core'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { MemorySaver } from '@langchain/langgraph'
import { describe, expect, it, vi } from 'vitest'
import { aguiRunContext, aguiTransformerFactory } from '../stream/index'
import { claudeAgentGraph } from './claudeAgent'

vi.mock('@agent/claude-agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agent/claude-agent')>()
  return {
    ...actual,
    runQueryInGraphNode: vi.fn(async ({ writer }) => {
      writer?.({
        name: 'agui',
        payload: {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'm1',
          role: 'assistant',
        },
      })
      writer?.({
        name: 'agui',
        payload: {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'm1',
          delta: 'done',
        },
      })
      writer?.({
        name: 'agui',
        payload: {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'm1',
        },
      })
      return {
        messages: [new AIMessage({ content: 'done' })],
        claudeSessionId: 'claude-sess-1',
      }
    }),
  }
})

describe('claudeAgentGraph + AguiTransformer', () => {
  const app = claudeAgentGraph.compile({
    checkpointer: new MemorySaver(),
    transformers: [aguiTransformerFactory],
  })

  it('checkpoint 写入 messages 与 claudeSessionId，aguiEvents 含文本流', async () => {
    const threadId = `claude-${randomUUID()}`
    const userText = '列出根目录'

    aguiRunContext.current = { threadId, runId: 'r1' }
    try {
      const stream = await app.streamEvents(
        { messages: [new HumanMessage(userText)] },
        { version: 'v3', configurable: { thread_id: threadId } },
      )
      const protocolDone = (async () => {
        for await (const _ of stream) { /* drain */ }
      })()
      const events = await Array.fromAsync(stream.extensions.aguiEvents)
      await protocolDone

      expect(events.some(e => e.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true)

      const snapshot = await app.getState({ configurable: { thread_id: threadId } })
      const values = snapshot.values as {
        messages?: unknown[]
        claudeSessionId?: string
      }
      expect(values.claudeSessionId).toBe('claude-sess-1')
      expect(Array.isArray(values.messages)).toBe(true)
      expect((values.messages?.length ?? 0)).toBeGreaterThanOrEqual(2)
    }
    finally {
      delete aguiRunContext.current
    }
  })
})
