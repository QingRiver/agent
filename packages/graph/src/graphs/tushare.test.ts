import type { TushareMcp } from '@agent/tools'
import type { BaseMessage } from '@langchain/core/messages'
import { randomUUID } from 'node:crypto'
import { AIMessage } from '@langchain/core/messages'
import { Annotation, Command, MemorySaver, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { describe, expect, it } from 'vitest'
import { buildTushareToolset, tushareGraph } from './tushare'

/** mock Tushare MCP：stock_basic 返回两只候选，触发 resolve_stock 的 select 中断 */
function mockTushareMcp(): TushareMcp {
  return {
    tools: [{
      name: 'stock_basic',
      description: '股票基础信息',
      inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
    }],
    callTool: async () => JSON.stringify([
      { ts_code: '000001.SZ', name: '平安银行', industry: '银行' },
      { ts_code: '601318.SH', name: '中国平安', industry: '保险' },
    ]),
    close: async () => {},
  }
}

describe('tushareGraph', () => {
  it('可编译（懒加载 MCP，不依赖 TUSHARE_TOKEN）', () => {
    expect(() => tushareGraph.compile({ checkpointer: new MemorySaver() })).not.toThrow()
  })

  it('resolve_stock 多匹配触发 select 中断，resume 后返回选定 ts_code（hitlSelect round-trip）', async () => {
    const toolset = await buildTushareToolset(mockTushareMcp())
    const resolveStock = toolset.tools.find(t => t.name === 'resolve_stock')!

    const TestState = Annotation.Root({
      messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
        default: () => [],
      }),
    })
    const app = new StateGraph(TestState)
      .addNode('tools', new ToolNode([resolveStock]))
      .addEdge('__start__', 'tools')
      .compile({ checkpointer: new MemorySaver() })

    const threadId = `tushare-${randomUUID()}`
    const callId = `call_${randomUUID()}`

    // 1. 喂 resolve_stock({name:'平安'}) → 多匹配 → interrupt(select)
    const stream1 = await app.stream(
      {
        messages: [new AIMessage({
          content: '',
          tool_calls: [{
            id: callId,
            name: 'resolve_stock',
            args: { name: '平安' },
          }],
        })],
      },
      { configurable: { thread_id: threadId } },
    )
    await Array.fromAsync(stream1)

    const snapshot = await app.getState({ configurable: { thread_id: threadId } })
    expect(snapshot.next).toContain('tools')
    const interrupt = snapshot.tasks[0]?.interrupts?.[0]
    expect(interrupt).toBeDefined()
    expect(interrupt!.value).toMatchObject({ type: 'select' })
    const options = (interrupt!.value as { options: { value: string }[] }).options
    expect(options).toHaveLength(2)

    // 2. resume 选 000001.SZ → 工具返回 {ts_code,name} JSON
    const stream2 = await app.stream(
      new Command({ resume: { value: '000001.SZ' } }),
      { configurable: { thread_id: threadId } },
    )
    await Array.fromAsync(stream2)

    const snapshot2 = await app.getState({ configurable: { thread_id: threadId } })
    expect(snapshot2.next).toHaveLength(0)
    const messages = snapshot2.values.messages as BaseMessage[]
    const toolMsg = messages.at(-1)!
    expect(toolMsg.getType()).toBe('tool')
    expect(String(toolMsg.content)).toContain('000001.SZ')
    expect(String(toolMsg.content)).toContain('平安银行')
  }, 15_000)
})
