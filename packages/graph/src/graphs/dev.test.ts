import type { AIMessage, BaseMessage } from '@langchain/core/messages'
import { randomUUID } from 'node:crypto'
import { HumanMessage } from '@langchain/core/messages'
import { Command, MemorySaver } from '@langchain/langgraph'
import { describe, expect, it } from 'vitest'
import { getAIMessageContent } from '../utils/index'
import { devGraph } from './dev'

describe('devGraph hitlDemo', () => {
  const app = devGraph.compile({
    checkpointer: new MemorySaver(),
  })

  async function nextInterrupt(input: Parameters<typeof app.stream>[0], threadId: string) {
    const stream = await app.stream(input, {
      streamMode: 'updates',
      configurable: { thread_id: threadId },
    })
    for await (const _chunk of stream) {
      // 跑完这一轮；中断挂在 checkpoint tasks 上
    }
    const snapshot = await app.getState({ configurable: { thread_id: threadId } })
    for (const task of snapshot.tasks ?? []) {
      const interrupt = task.interrupts?.[0]
      if (interrupt != null && typeof interrupt === 'object' && 'value' in interrupt)
        return interrupt.value as { type?: string, message?: string, details?: string }
    }
    return undefined
  }

  it('澄清选 hitlDemo 后串联 input → select → multiSelect → approval', async () => {
    const threadId = `dev-hitl-${randomUUID()}`
    const userInput = '向账户 0x123 转账 100 ETH'

    const clarify = await nextInterrupt(
      { input: userInput, messages: [new HumanMessage(userInput)] },
      threadId,
    )
    expect(clarify).toMatchObject({ type: 'select' })

    const step1 = await nextInterrupt(new Command({ resume: { value: 'hitlDemo' } }), threadId)
    expect(step1).toMatchObject({ type: 'input' })

    const step2 = await nextInterrupt(new Command({ resume: { value: '季度资金归集' } }), threadId)
    expect(step2).toMatchObject({ type: 'select' })

    const step3 = await nextInterrupt(new Command({ resume: { value: 'high' } }), threadId)
    expect(step3).toMatchObject({ type: 'multiSelect' })

    const step4 = await nextInterrupt(
      new Command({ resume: { values: ['audit', 'notify'] } }),
      threadId,
    )
    expect(step4).toMatchObject({
      type: 'approval',
      message: expect.stringContaining('请确认'),
      details: expect.stringContaining('季度资金归集'),
    })

    expect(await nextInterrupt(new Command({ resume: { approved: true } }), threadId)).toBeUndefined()

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
    const threadId = `dev-hitl-reject-${randomUUID()}`
    const userInput = '删除生产数据'

    await nextInterrupt(
      { input: userInput, messages: [new HumanMessage(userInput)] },
      threadId,
    )
    await nextInterrupt(new Command({ resume: { value: 'hitlDemo' } }), threadId)
    await nextInterrupt(new Command({ resume: { value: '误操作恢复' } }), threadId)
    await nextInterrupt(new Command({ resume: { value: 'low' } }), threadId)
    await nextInterrupt(new Command({ resume: { values: [] } }), threadId)

    expect(await nextInterrupt(
      new Command({ resume: { approved: false, reason: '风险过高' } }),
      threadId,
    )).toBeUndefined()

    const snapshot = await app.getState({ configurable: { thread_id: threadId } })
    expect(getAIMessageContent(snapshot.values.messages[1] as AIMessage)).toBe('已拒绝：风险过高')
    expect(snapshot.values.result).toMatchObject({ status: 'rejected', reason: '风险过高' })
  }, 60_000)
})
