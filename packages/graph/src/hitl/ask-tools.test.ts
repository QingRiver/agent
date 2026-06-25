import type { BaseMessage } from '@langchain/core/messages'
import { randomUUID } from 'node:crypto'
import { AIMessage } from '@langchain/core/messages'
import { Annotation, Command, MemorySaver, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { describe, expect, it } from 'vitest'
import { ASK_TOOLS } from './ask-tools'

/**
 * 验证 ask_* 工具内 interrupt 的 round-trip:
 *  1. 喂一个含 ask_input tool_call 的 AIMessage → ToolNode 执行 ask_input → interrupt 暂停
 *  2. 检查 interrupts[].payload 是 protocol input 形状
 *  3. Command({resume}) → interrupt 返回 {value} → 工具返回 `用户回答：${value}` → ToolMessage
 *
 * 不依赖真实 LLM:手动构造 AIMessage 触发 tool call。
 */
describe('ask-tools tool 内 interrupt round-trip', () => {
  const TestState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer: (x, y) => x.concat(y),
      default: () => [],
    }),
  })

  const app = new StateGraph(TestState)
    .addNode('tools', new ToolNode(ASK_TOOLS))
    .addEdge('__start__', 'tools')
    .compile({ checkpointer: new MemorySaver() })

  it('ask_input interrupt 暂停并携带 protocol payload,resume 后返回用户回答', async () => {
    const threadId = `ask-${randomUUID()}`
    const callId = `call_${randomUUID()}`

    // 1. 触发 ask_input tool call → 期望 interrupt 暂停
    const stream1 = await app.stream(
      {
        messages: [new AIMessage({
          content: '',
          tool_calls: [{
            id: callId,
            name: 'ask_input',
            args: { message: '请问您想查询哪个城市的天气？', placeholder: '如：北京' },
          }],
        })],
      },
      { configurable: { thread_id: threadId } },
    )
    await Array.fromAsync(stream1)

    const snapshot = await app.getState({ configurable: { thread_id: threadId } })
    expect(snapshot.next).toContain('tools')

    const task = snapshot.tasks[0]!
    const interrupt = task.interrupts?.[0]
    expect(interrupt).toBeDefined()
    expect(interrupt!.value).toMatchObject({
      type: 'input',
      message: '请问您想查询哪个城市的天气？',
      placeholder: '如：北京',
    })

    // 2. resume → interrupt 返回 {value:'上海'} → 工具返回 `用户回答：上海`
    const stream2 = await app.stream(
      new Command({ resume: { value: '上海' } }),
      { configurable: { thread_id: threadId } },
    )
    await Array.fromAsync(stream2)

    const snapshot2 = await app.getState({ configurable: { thread_id: threadId } })
    expect(snapshot2.next).toHaveLength(0)

    const messages = snapshot2.values.messages as BaseMessage[]
    const toolMsg = messages.at(-1)!
    expect(toolMsg.getType()).toBe('tool')
    expect(String(toolMsg.content)).toBe('用户回答：上海')
  }, 15_000)
})
