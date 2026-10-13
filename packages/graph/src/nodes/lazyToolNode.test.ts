import type { BaseMessage } from '@langchain/core/messages'
import { randomUUID } from 'node:crypto'
import { AIMessage } from '@langchain/core/messages'
import { Annotation, MemorySaver, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { describe, expect, it } from 'vitest'
import { ASK_TOOLS } from '../tools/ask-tools'
import { LazyToolNode } from './lazyToolNode'

const TestState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
})

function compileToolsNode(toolsNode: ToolNode) {
  return new StateGraph(TestState)
    .addNode('tools', toolsNode)
    .addEdge('__start__', 'tools')
    .compile({
      checkpointer: new MemorySaver(),
    })
}

async function interruptCount(app: ReturnType<typeof compileToolsNode>, callId: string) {
  const threadId = `t-${randomUUID()}`
  const stream = await app.stream(
    {
      messages: [new AIMessage({
        content: '',
        tool_calls: [{
          id: callId,
          name: 'ask_input',
          args: { message: '城市？' },
        }],
      })],
    },
    { streamMode: 'updates', configurable: { thread_id: threadId } },
  )
  for await (const _chunk of stream) {
    // drain
  }
  const snapshot = await app.getState({ configurable: { thread_id: threadId } })
  return (snapshot.tasks ?? []).reduce((count, task) => count + (task.interrupts?.length ?? 0), 0)
}

describe('toolnode mounting (no nested invoke)', () => {
  it('direct ToolNode 挂起一次 interrupt', async () => {
    const app = compileToolsNode(new ToolNode(ASK_TOOLS))
    expect(await interruptCount(app, `call_${randomUUID()}`)).toBe(1)
  })

  it('lazy ToolNode 作为图节点挂起一次 interrupt', async () => {
    const app = compileToolsNode(new LazyToolNode(async () => ASK_TOOLS))
    expect(await interruptCount(app, `call_${randomUUID()}`)).toBe(1)
  })
})
