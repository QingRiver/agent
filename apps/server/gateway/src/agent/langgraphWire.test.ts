import { AIMessage, AIMessageChunk, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'
import {
  flattenLangChainMessage,
  lastHumanText,
  projectLangGraphChunk,
  readSnapshotInterrupts,
  readSnapshotMessages,
} from './langgraphWire'

describe('flattenLangChainMessage', () => {
  it('把 AIMessage 收成 assistant-ui 扁平消息', () => {
    const message = new AIMessage({
      id: 'ai-1',
      content: '北京晴',
      tool_calls: [{
        id: 'call-1',
        name: 'weather_current',
        args: { city: '北京', temperatureC: 20, condition: '晴' },
      }],
    })

    expect(flattenLangChainMessage(message)).toMatchObject({
      id: 'ai-1',
      type: 'ai',
      content: message.contentBlocks,
      tool_calls: [{
        id: 'call-1',
        name: 'weather_current',
        args: { city: '北京', temperatureC: 20, condition: '晴' },
      }],
    })
  })

  it('流式 AIMessageChunk 保留 tool_call_chunks', () => {
    const message = new AIMessageChunk({
      id: 'ai-1',
      content: '',
      tool_call_chunks: [{
        id: 'call-1',
        name: 'weather_current',
        args: '{"city":',
        index: 0,
        type: 'tool_call_chunk',
      }],
    })

    expect(flattenLangChainMessage(message)?.tool_call_chunks).toEqual([{
      id: 'call-1',
      name: 'weather_current',
      args: '{"city":',
      index: 0,
      type: 'tool_call_chunk',
    }])
  })

  it('aI 消息发标准 contentBlocks，思考成 reasoning 块', () => {
    const message = new AIMessageChunk({
      id: 'ai-1',
      content: '北京晴',
      additional_kwargs: { reasoning_content: '先确认城市' },
      response_metadata: { model_provider: 'deepseek' },
    })

    expect(flattenLangChainMessage(message)?.content).toEqual([
      { type: 'reasoning', reasoning: '先确认城市' },
      { type: 'text', text: '北京晴' },
    ])
  })

  it('保留 tool 消息的 tool_call_id', () => {
    const message = new ToolMessage({
      id: 'tool-1',
      content: '已展示天气卡片',
      tool_call_id: 'call-1',
      name: 'weather_current',
    })

    expect(flattenLangChainMessage(message)).toMatchObject({
      id: 'tool-1',
      type: 'tool',
      tool_call_id: 'call-1',
      name: 'weather_current',
    })
  })
})

describe('projectLangGraphChunk', () => {
  it('custom 原样转发', () => {
    const events = projectLangGraphChunk([
      'custom',
      { name: 'writer_change_summaries', payload: { polished: '改后' } },
    ])

    expect(events).toEqual([{
      event: 'custom',
      data: { name: 'writer_change_summaries', payload: { polished: '改后' } },
    }])
  })

  it('messages 元组扁平化后原样转发', () => {
    const events = projectLangGraphChunk([
      'messages',
      [new AIMessage({ id: 'ai-1', content: '你好' }), { langgraph_node: 'agent_weather' }],
    ])

    expect(events).toEqual([{
      event: 'messages',
      data: [
        { id: 'ai-1', type: 'ai', content: [{ type: 'text', text: '你好' }] },
        { langgraph_node: 'agent_weather' },
      ],
    }])
  })

  it('updates 剥掉 messages，留下其余状态', () => {
    const events = projectLangGraphChunk([
      'updates',
      {
        agent_weather: {
          messages: [new AIMessage({ id: 'ai-1', content: '你好' })],
        },
        write: {
          messages: [new ToolMessage({
            id: 'tool-1',
            content: 'ok',
            tool_call_id: 'call-1',
          })],
          polished: '改后正文',
        },
      },
    ])

    expect(events).toEqual([{
      event: 'updates',
      data: {
        write: { polished: '改后正文' },
      },
    }])
  })

  it('updates 的 __interrupt__ 收成 { id, value }', () => {
    const events = projectLangGraphChunk([
      'updates',
      {
        __interrupt__: [{
          id: 'int-1',
          value: { type: 'approval', message: '请确认', details: '查北京天气' },
        }],
      },
    ])

    expect(events).toEqual([{
      event: 'updates',
      data: {
        __interrupt__: [{
          id: 'int-1',
          value: { type: 'approval', message: '请确认', details: '查北京天气' },
        }],
      },
    }])
  })
})

describe('readSnapshotInterrupts', () => {
  it('直接读 tasks[].interrupts 的 id 和 value', () => {
    expect(readSnapshotInterrupts({
      tasks: [{
        interrupts: [{
          id: 'int-1',
          value: { type: 'input', message: '哪个城市？' },
        }],
      }],
    })).toEqual([{
      id: 'int-1',
      value: { type: 'input', message: '哪个城市？' },
    }])
  })
})

describe('readSnapshotMessages', () => {
  it('从 checkpoint values.messages 扁平化', () => {
    expect(readSnapshotMessages({
      messages: [new HumanMessage({ id: 'h-1', content: '北京天气' })],
    })).toEqual([{
      id: 'h-1',
      type: 'human',
      content: '北京天气',
    }])
  })
})

describe('lastHumanText', () => {
  it('取最后一条 human', () => {
    expect(lastHumanText([
      { type: 'human', content: '先问一句' },
      { type: 'ai', content: '好' },
      { type: 'human', content: [{ type: 'text', text: '北京天气' }] },
    ], '开始演示')).toBe('北京天气')
    expect(lastHumanText([], '开始演示')).toBe('开始演示')
  })
})
