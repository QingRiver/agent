import type { AIMessage, BaseMessage } from '@langchain/core/messages'
import { randomUUID } from 'node:crypto'
import { EventType } from '@ag-ui/core'
import { HumanMessage } from '@langchain/core/messages'
import { Command, MemorySaver } from '@langchain/langgraph'
import { describe, expect, it } from 'vitest'
import { hitlGraph } from './hitlGraph.js'
import { aguiRunContext, aguiTransformerFactory } from './stream/index.js'
import { getAIMessageContent } from './utils/index.js'

describe('hitlGraph + AguiTransformer', () => {
  const app = hitlGraph.compile({
    checkpointer: new MemorySaver(),
    transformers: [aguiTransformerFactory],
  })

  it('interrupt 后 resume 完成流程', async () => {
    const threadId = `hitl-${randomUUID()}`
    const userInput = '向账户 0x123 转账 100 ETH'

    aguiRunContext.current = { threadId, runId: 'r1' }
    try {
      const stream1 = await app.streamEvents(
        {
          input: userInput,
          messages: [new HumanMessage(userInput)],
        },
        { version: 'v3', configurable: { thread_id: threadId } },
      )
      const protocolDone1 = (async () => {
        for await (const _ of stream1) { /* drain protocol */ }
      })()
      const events1 = await Array.fromAsync(stream1.extensions.aguiEvents)
      await protocolDone1

      const runFinished1 = events1.find(e => e.type === EventType.RUN_FINISHED)
      expect(runFinished1).toMatchObject({
        outcome: {
          type: 'interrupt',
          interrupts: [expect.objectContaining({
            reason: 'confirmation',
            message: expect.stringContaining('请确认'),
          })],
        },
      })
    }
    finally {
      delete aguiRunContext.current
    }

    aguiRunContext.current = { threadId, runId: 'r2' }
    try {
      const stream2 = await app.streamEvents(
        new Command({ resume: { approved: true } }),
        { version: 'v3', configurable: { thread_id: threadId } },
      )
      const protocolDone2 = (async () => {
        for await (const _ of stream2) { /* drain protocol */ }
      })()
      const events2 = await Array.fromAsync(stream2.extensions.aguiEvents)
      await protocolDone2

      const interruptFinished = events2.find(
        e => e.type === EventType.RUN_FINISHED
          && 'outcome' in e
          && e.outcome?.type === 'interrupt',
      )
      expect(interruptFinished).toBeUndefined()

      const snapshot = await app.getState({ configurable: { thread_id: threadId } })
      const messages = snapshot.values.messages as BaseMessage[]
      expect(messages).toHaveLength(2)
      expect(messages[0]?.content).toBe(userInput)
      expect(getAIMessageContent(messages[1]! as AIMessage)).toBe(`已批准执行：${userInput}`)
    }
    finally {
      delete aguiRunContext.current
    }
  }, 30_000)
})
