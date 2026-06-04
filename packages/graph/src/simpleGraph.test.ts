import type { AIMessage } from '@langchain/core/messages'
import type { ProtocolEvent } from '@langchain/langgraph'
import { match, P } from 'ts-pattern'
import { simpleGraph } from './simpleGraph'
import { normalizeMessages } from './utils'

const input = { messages: [] as string[] }

interface LifecycleEventData { event: string, graph_name: string }

describe('simpleGraph', () => {
  const app = simpleGraph.compile()

  it('streamEvents v3：stream.values快照', async () => {
    const stream = await app.streamEvents(input, { version: 'v3' })

    const snapshots: Array<{ messages: string[] }> = []

    for await (const snapshot of stream.values) {
      snapshots.push(normalizeMessages(snapshot))
    }

    expect(snapshots).toEqual([
      { messages: [] },
      { messages: ['来自节点 A 的响应'] },
      {
        messages: ['来自节点 A 的响应', '来自节点 B 的流程结束'],
      },
    ])

    const finalState = await stream.output
    expect(normalizeMessages(finalState)).toEqual(snapshots.at(-1))
  }, 10_000)

  it('streamEvents v3： lifecycle / values / updates', async () => {
    const stream = await app.streamEvents(input, { version: 'v3' })

    const valueSnapshots: Array<{ messages: string[] }> = []
    const updateNodes: string[] = []
    const lifecycleEvents: LifecycleEventData[] = []

    for await (const event of stream) {
      expect(event.type).toBe('event')

      match(event as ProtocolEvent)
        .with({ method: 'lifecycle' }, ({ params }) => {
          lifecycleEvents.push(params.data as LifecycleEventData)
        })
        .with({ method: 'values' }, ({ params }) => {
          const messageData = params.data as { messages: AIMessage[] }
          valueSnapshots.push(normalizeMessages(messageData))
        })
        .with({ method: 'updates', params: { node: P.string } }, ({ params: { node } }) => {
          updateNodes.push(node)
        })
        .otherwise(() => {})
    }

    expect(lifecycleEvents).toEqual([
      { event: 'running', graph_name: 'root' },
      { event: 'started', graph_name: 'node_a' },
      { event: 'completed', graph_name: 'node_a' },
      { event: 'started', graph_name: 'node_b' },
      { event: 'completed', graph_name: 'node_b' },
      { event: 'completed', graph_name: 'root' },
    ])

    expect(valueSnapshots).toEqual([
      { messages: [] },
      { messages: ['来自节点 A 的响应'] },
      { messages: ['来自节点 A 的响应', '来自节点 B 的流程结束'] },
    ])

    expect(updateNodes).toEqual(['node_a', 'node_b'])
  }, 10_000)

  it('streamEvents v2：按节点执行顺序触发 on_chain_* 事件', async () => {
    const stream = await app.streamEvents(input, { version: 'v2' })

    const events: Array<{ event: string, name?: string }> = []
    for await (const raw of stream) {
      events.push({ event: raw.event, name: raw.name })
    }

    const chainNames = events
      .filter(e => e.event === 'on_chain_start' || e.event === 'on_chain_end')
      .map(e => `${e.event}:${e.name ?? ''}`)

    expect(chainNames).toEqual([
      'on_chain_start:LangGraph',
      'on_chain_start:__start__',
      'on_chain_end:__start__',
      'on_chain_start:node_a',
      'on_chain_end:node_a',
      'on_chain_start:node_b',
      'on_chain_end:node_b',
      'on_chain_end:LangGraph',
    ])

    expect(events.some(e => e.event === 'on_chain_stream')).toBe(true)
  }, 10_000)
})
