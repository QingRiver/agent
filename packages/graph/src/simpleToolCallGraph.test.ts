import type { AIMessage, ToolMessage } from '@langchain/core/messages'
import type { ProtocolEvent } from '@langchain/langgraph'
import type { AguiTextMessageEvent } from './stream/mapMessagesToAgUi.js'
import { EventType } from '@ag-ui/core'
import { HumanMessage } from '@langchain/core/messages'
import { match } from 'ts-pattern'
import {
  FETCH_USER_ORDER_TOOL_NAME,
  ORDER_TOOL_PROGRESS_EVENT,
  simpleToolCallGraph,
} from './simpleToolCallGraph'
import { aguiTransformerFactory } from './stream/aguiTransformer.js'
import { getAIMessageContent } from './utils'

const input = { messages: [new HumanMessage('取消订单 10086')] }

interface LifecycleEventData { event: string, graph_name: string }

describe('simpleToolCallGraph', () => {
  const app = simpleToolCallGraph.compile()
  const appWithAguiTransformer = simpleToolCallGraph.compile({
    transformers: [aguiTransformerFactory],
  })

  it('先触发 fetch_user_order 工具调用，再返回最终 AIMessage', async () => {
    const result = await app.invoke(input)

    const toolMessages = result.messages.filter(
      m => m.type === 'tool',
    ) as ToolMessage[]
    expect(toolMessages).toHaveLength(1)
    expect(toolMessages[0]?.name).toBe(FETCH_USER_ORDER_TOOL_NAME)
    expect(toolMessages[0]?.content).toContain('10086')

    const last = result.messages.at(-1)!
    expect(getAIMessageContent(last as AIMessage)).toBe(
      '收到，您的订单已取消！',
    )
  }, 10_000)

  it('streamEvents v3：ProtocolEvent 含 tools / lifecycle / values', async () => {
    const stream = await app.streamEvents(input, { version: 'v3' })

    const methods: string[] = []
    const lifecycleEvents: LifecycleEventData[] = []
    const valueSnapshots: Array<{ messages: string[] }> = []

    const messagesOnly: string[] = []

    for await (const event of stream) {
      expect(event.type).toBe('event')
      methods.push(event.method)

      match(event as ProtocolEvent)
        .with({ method: 'lifecycle' }, ({ params }) => {
          lifecycleEvents.push(params.data as LifecycleEventData)
        })
        .with({ method: 'values' }, ({ params }) => {
          const messageData = params.data as { messages: AIMessage[] }
          valueSnapshots.push({
            messages: messageData.messages.map(getAIMessageContent),
          })
        })
        .otherwise(() => {})
    }

    for await (const messageStream of stream.messages) {
      messagesOnly.push(await messageStream.text)
    }

    expect(messagesOnly).toEqual([
      '正在调用取消订单工具',
      '收到，您的订单已取消！',
    ])

    expect(lifecycleEvents).toEqual([
      { event: 'running', graph_name: 'root' },
      { event: 'started', graph_name: 'agent' },
      { event: 'completed', graph_name: 'agent' },
      { event: 'started', graph_name: 'tools' },
      { event: 'completed', graph_name: 'tools' },
      { event: 'started', graph_name: 'agent' },
      { event: 'completed', graph_name: 'agent' },
      { event: 'completed', graph_name: 'root' },
    ])
    expect(methods).toContain('values')
    expect(methods).toContain('updates')
    expect(valueSnapshots.length).toBeGreaterThan(0)

    const finalState = await stream.output
    const last = finalState.messages.at(-1)!
    expect(getAIMessageContent(last as AIMessage)).toBe('收到，您的订单已取消！')
  }, 10_000)

  it('streamEvents v3：extensions 产出 tool / custom / message 事件', async () => {
    const stream = await appWithAguiTransformer.streamEvents(input, { version: 'v3' })

    const [toolEvents, customEvents, messageEvents] = await Promise.all([
      Array.fromAsync(stream.extensions.toolEvents),
      Array.fromAsync(stream.extensions.customEvents),
      Array.fromAsync(stream.extensions.messageEvents),
    ])

    expect(toolEvents).toEqual([
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'call_mock_9527',
        toolCallName: FETCH_USER_ORDER_TOOL_NAME,
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'call_mock_9527',
        delta: JSON.stringify({ orderId: '10086' }),
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: 'call_mock_9527',
      },
      {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'call_mock_9527',
        messageId: expect.any(String),
        content: expect.stringContaining('10086'),
        role: 'tool',
      },
    ])

    expect(customEvents).toHaveLength(1)
    expect(customEvents[0]).toMatchObject({
      type: EventType.CUSTOM,
      name: ORDER_TOOL_PROGRESS_EVENT,
      value: { orderId: '10086', step: 'dispatch' },
    })

    const starts = messageEvents.filter(
      (e): e is AguiTextMessageEvent & { type: typeof EventType.TEXT_MESSAGE_START } =>
        e.type === EventType.TEXT_MESSAGE_START,
    )
    const contents = messageEvents.filter(
      (e): e is AguiTextMessageEvent & { type: typeof EventType.TEXT_MESSAGE_CONTENT } =>
        e.type === EventType.TEXT_MESSAGE_CONTENT,
    )
    const ends = messageEvents.filter(
      (e): e is AguiTextMessageEvent & { type: typeof EventType.TEXT_MESSAGE_END } =>
        e.type === EventType.TEXT_MESSAGE_END,
    )
    expect(starts).toHaveLength(2)
    expect(ends).toHaveLength(2)
    const fullText = contents.map(e => e.delta).join('')
    expect(fullText).toBe('正在调用取消订单工具收到，您的订单已取消！')
  }, 10_000)

  it('streamEvents v3：aguiEvents 按协议顺序合并 tool / custom / message', async () => {
    const stream = await appWithAguiTransformer.streamEvents(input, { version: 'v3' })

    const protocolDone = (async () => {
      for await (const _ of stream) { /* drain protocol */ }
    })()

    const aguiEvents = await Array.fromAsync(stream.extensions.aguiEvents)
    await protocolDone

    const customIdx = aguiEvents.findIndex(
      e => e.type === EventType.CUSTOM && e.name === ORDER_TOOL_PROGRESS_EVENT,
    )
    const firstToolIdx = aguiEvents.findIndex(e => e.type === EventType.TOOL_CALL_START)
    const secondTextStartIdx = aguiEvents.findIndex(
      (e, i) => e.type === EventType.TEXT_MESSAGE_START && i > firstToolIdx,
    )

    expect(customIdx).toBeGreaterThanOrEqual(0)
    expect(firstToolIdx).toBeGreaterThan(customIdx)
    expect(secondTextStartIdx).toBeGreaterThan(firstToolIdx)
  }, 10_000)
})
