import type { BaseMessage } from '@langchain/core/messages'
import type { AguiMappedEvent } from '../stream/index'
import { randomUUID } from 'node:crypto'
import { EventType } from '@ag-ui/core'
import { AIMessage } from '@langchain/core/messages'
import { Annotation, MemorySaver, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { describe, expect, it } from 'vitest'
import { aguiTransformerFactory, buildInterruptFinalizeEvents } from '../stream/index'
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
      transformers: [aguiTransformerFactory],
    })
}

async function countStarts(app: ReturnType<typeof compileToolsNode>, callId: string) {
  const threadId = `t-${randomUUID()}`
  const stream = await app.streamEvents(
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
    { version: 'v3', configurable: { thread_id: threadId } },
  )
  const protocolDone = (async () => {
    for await (const _ of stream) { /* drain */ }
  })()
  const events: AguiMappedEvent[] = await Array.fromAsync(stream.extensions.aguiEvents)
  await protocolDone
  if (!events.some(e => e.type === EventType.RUN_FINISHED) && stream.interrupted) {
    const snapshot = await stream.output
    events.push(...buildInterruptFinalizeEvents({
      threadId,
      runId: 'r1',
      interrupts: stream.interrupts,
      snapshot: snapshot as Record<string, unknown>,
    }) as AguiMappedEvent[])
  }
  return events.filter(e => e.type === EventType.TOOL_CALL_START).length
}

describe('toolnode mounting (no nested invoke)', () => {
  it('direct ToolNode emits a single TOOL_CALL_START', async () => {
    const app = compileToolsNode(new ToolNode(ASK_TOOLS))
    expect(await countStarts(app, `call_${randomUUID()}`)).toBe(1)
  })

  it('lazy ToolNode as graph node emits a single TOOL_CALL_START', async () => {
    const app = compileToolsNode(new LazyToolNode(async () => ASK_TOOLS))
    expect(await countStarts(app, `call_${randomUUID()}`)).toBe(1)
  })

  it('nested toolNode.invoke double-emits TOOL_CALL_START (anti-pattern)', async () => {
    const toolNode = new ToolNode(ASK_TOOLS)
    const app = new StateGraph(TestState)
      .addNode('tools', async (state, config) => {
        const result = await toolNode.invoke(state, config)
        return { messages: (result as { messages?: BaseMessage[] }).messages ?? [] }
      })
      .addEdge('__start__', 'tools')
      .compile({
        checkpointer: new MemorySaver(),
        transformers: [aguiTransformerFactory],
      })
    expect(await countStarts(app, `call_${randomUUID()}`)).toBeGreaterThan(1)
  })
})
