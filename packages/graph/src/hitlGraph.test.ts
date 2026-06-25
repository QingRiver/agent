import type { AIMessage, BaseMessage } from '@langchain/core/messages'
import { randomUUID } from 'node:crypto'
import { EventType } from '@ag-ui/core'
import { HumanMessage } from '@langchain/core/messages'
import { Command, MemorySaver } from '@langchain/langgraph'
import { describe, expect, it } from 'vitest'
import { hitlGraph } from './hitlGraph'
import { aguiRunContext, aguiTransformerFactory } from './stream/index'
import { getAIMessageContent } from './utils/index'

describe('hitlGraph + AguiTransformer', () => {
  const app = hitlGraph.compile({
    checkpointer: new MemorySaver(),
    transformers: [aguiTransformerFactory],
  })

  async function streamUntilInterrupt(
    input: Parameters<typeof app.streamEvents>[0],
    threadId: string,
    runId: string,
  ) {
    aguiRunContext.current = { threadId, runId }
    try {
      const stream = await app.streamEvents(
        input,
        { version: 'v3', configurable: { thread_id: threadId } },
      )
      const protocolDone = (async () => {
        for await (const _ of stream) { /* drain protocol */ }
      })()
      const events = await Array.fromAsync(stream.extensions.aguiEvents)
      await protocolDone

      const onInterrupt = events.find(
        e => e.type === EventType.CUSTOM && 'name' in e && e.name === 'on_interrupt',
      ) as { value: Record<string, unknown> } | undefined
      const runFinished = events.find(e => e.type === EventType.RUN_FINISHED)
      return { onInterrupt, runFinished, events }
    }
    finally {
      delete aguiRunContext.current
    }
  }

  it('串联 input → select → multiSelect → approval 后完成流程', async () => {
    const threadId = `hitl-${randomUUID()}`
    const userInput = '向账户 0x123 转账 100 ETH'

    const step1 = await streamUntilInterrupt(
      { input: userInput, messages: [new HumanMessage(userInput)] },
      threadId,
      'r1',
    )
    expect(step1.onInterrupt?.value).toMatchObject({ type: 'input' })
    expect(step1.runFinished).toMatchObject({
      outcome: { type: 'interrupt' },
    })

    const step2 = await streamUntilInterrupt(
      new Command({ resume: { value: '季度资金归集' } }),
      threadId,
      'r2',
    )
    expect(step2.onInterrupt?.value).toMatchObject({ type: 'select' })

    const step3 = await streamUntilInterrupt(
      new Command({ resume: { value: 'high' } }),
      threadId,
      'r3',
    )
    expect(step3.onInterrupt?.value).toMatchObject({ type: 'multiSelect' })

    const step4 = await streamUntilInterrupt(
      new Command({ resume: { values: ['audit', 'notify'] } }),
      threadId,
      'r4',
    )
    expect(step4.onInterrupt?.value).toMatchObject({
      type: 'approval',
      message: expect.stringContaining('请确认'),
      details: expect.stringContaining('季度资金归集'),
    })

    const step5 = await streamUntilInterrupt(
      new Command({ resume: { approved: true } }),
      threadId,
      'r5',
    )
    const interruptFinished = step5.events.find(
      (e): e is Extract<typeof e, { type: typeof EventType.RUN_FINISHED }> =>
        e.type === EventType.RUN_FINISHED
        && 'outcome' in e
        && e.outcome?.type === 'interrupt',
    )
    expect(interruptFinished).toBeUndefined()

    const snapshot = await app.getState({ configurable: { thread_id: threadId } })
    const messages = snapshot.values.messages as BaseMessage[]
    expect(messages).toHaveLength(2)
    expect(messages[0]?.content).toBe(userInput)
    expect(getAIMessageContent(messages[1]! as AIMessage)).toContain('已批准执行')
    expect(getAIMessageContent(messages[1]! as AIMessage)).toContain('季度资金归集')
    expect(getAIMessageContent(messages[1]! as AIMessage)).toContain('高')
    expect(getAIMessageContent(messages[1]! as AIMessage)).toContain('记录审计日志')

    expect(snapshot.values.result).toMatchObject({
      status: 'approved',
      toolInput: userInput,
      userPurpose: '季度资金归集',
      priority: 'high',
      extras: ['audit', 'notify'],
    })
  }, 60_000)

  it('approval 拒绝时提前结束', async () => {
    const threadId = `hitl-reject-${randomUUID()}`
    const userInput = '删除生产数据'

    await streamUntilInterrupt(
      { input: userInput, messages: [new HumanMessage(userInput)] },
      threadId,
      'r1',
    )
    await streamUntilInterrupt(new Command({ resume: { value: '误操作恢复' } }), threadId, 'r2')
    await streamUntilInterrupt(new Command({ resume: { value: 'low' } }), threadId, 'r3')
    await streamUntilInterrupt(new Command({ resume: { values: [] } }), threadId, 'r4')

    const final = await streamUntilInterrupt(
      new Command({ resume: { approved: false, reason: '风险过高' } }),
      threadId,
      'r5',
    )
    expect(final.events.find(
      (e): e is Extract<typeof e, { type: typeof EventType.RUN_FINISHED }> =>
        e.type === EventType.RUN_FINISHED
        && 'outcome' in e
        && e.outcome?.type === 'interrupt',
    )).toBeUndefined()

    const snapshot = await app.getState({ configurable: { thread_id: threadId } })
    expect(getAIMessageContent(snapshot.values.messages[1] as AIMessage)).toBe('已拒绝：风险过高')
    expect(snapshot.values.result).toMatchObject({ status: 'rejected', reason: '风险过高' })
  }, 60_000)
})
