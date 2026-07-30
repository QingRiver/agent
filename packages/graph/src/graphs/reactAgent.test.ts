import type { TextMessageContentEvent } from '@ag-ui/core'
import type { AguiMappedEvent } from '../stream'
import { randomUUID } from 'node:crypto'
import { EventType } from '@ag-ui/core'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { MemorySaver } from '@langchain/langgraph'
import { describe, expect, it, vi } from 'vitest'
import { aguiTransformerFactory } from '../stream'
import { KB_SEARCH_TOOL_NAME } from '../tools/kb'
import {
  clampMaxSteps,
  composeReactAgentSystemPrompt,
  DEFAULT_REACT_AGENT_USER_PROMPT,
  reactAgentGraph,
  readReactAgentForwardedProps,
  sanitizeKbId,
  sanitizeUserPrompt,
} from './reactAgent'

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(async () => new AIMessage({
    id: 'react-final-1',
    content: 'AG-UI 是事件映射层 [1](/kb?doc=doc-a&chunk=chunk-a)。',
  })),
}))

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    bindTools() {
      return this
    }

    invoke = mockInvoke
  },
}))

describe('reactAgent prompts / sanitizers', () => {
  it('composeReactAgentSystemPrompt always appends platform segments', () => {
    const out = composeReactAgentSystemPrompt('用户角色')
    expect(out.startsWith('用户角色')).toBe(true)
    expect(out).toContain('ask_input')
    expect(out).toContain('kb_search')
  })

  it('sanitizeUserPrompt falls back to default when empty', () => {
    expect(sanitizeUserPrompt('')).toBe(DEFAULT_REACT_AGENT_USER_PROMPT)
    expect(sanitizeUserPrompt(null)).toBe(DEFAULT_REACT_AGENT_USER_PROMPT)
  })

  it('clampMaxSteps clamps to 1..200', () => {
    expect(clampMaxSteps(0)).toBe(1)
    expect(clampMaxSteps(999)).toBe(200)
    expect(clampMaxSteps(7)).toBe(7)
    expect(clampMaxSteps('x')).toBe(50)
  })

  it('sanitizeKbId trims and falls back', () => {
    expect(sanitizeKbId('  my_kb  ')).toBe('my_kb')
    expect(sanitizeKbId('', 'kb_default')).toBe('kb_default')
  })

  it('readReactAgentForwardedProps prefers namespaced forwardedProps', () => {
    expect(readReactAgentForwardedProps({
      forwardedProps: {
        reactAgent: {
          userPrompt: 'from-props',
          kbId: 'kb_lab',
          maxSteps: 12,
        },
      },
    })).toEqual({
      userPrompt: 'from-props',
      kbId: 'kb_lab',
      maxSteps: 12,
    })
    expect(readReactAgentForwardedProps({
      forwardedProps: { command: { resume: true } },
    })).toEqual({})
    expect(readReactAgentForwardedProps({
      forwardedProps: { reactAgent: { maxSteps: 9999 } },
    })).toEqual({})
  })
})

describe('reactAgent kb citation links in AG-UI stream', () => {
  it('kb_search 之后终答流式推送标准 Markdown 链接', async () => {
    const toolResult = [
      '找到 1 条相关片段：',
      '',
      '[1] 引用请写 `[1](/kb?doc=doc-a&chunk=chunk-a)`',
      'AG-UI 负责 ProtocolEvent → AG-UI 事件映射。',
      '',
    ].join('\n')

    const app = reactAgentGraph.compile({
      checkpointer: new MemorySaver(),
      transformers: [aguiTransformerFactory],
    })
    const threadId = `react-${randomUUID()}`
    const stream = await app.streamEvents(
      {
        messages: [
          new HumanMessage('解释一下 agui'),
          new AIMessage({
            content: '',
            tool_calls: [{
              id: 'call_kb_1',
              name: KB_SEARCH_TOOL_NAME,
              args: { query: 'agui' },
            }],
          }),
          new ToolMessage({
            tool_call_id: 'call_kb_1',
            name: KB_SEARCH_TOOL_NAME,
            content: toolResult,
          }),
        ],
      },
      {
        version: 'v3',
        configurable: { thread_id: threadId, kbId: 'kb_test' },
        recursionLimit: 8,
      },
    )

    async function drainProtocol() {
      for await (const _ of stream) { /* drain */ }
    }

    const protocolDone = drainProtocol()
    const events = await Array.fromAsync(
      stream.extensions.aguiEvents as AsyncIterable<AguiMappedEvent>,
    )
    await protocolDone

    const text = events
      .filter((e): e is TextMessageContentEvent => e.type === EventType.TEXT_MESSAGE_CONTENT)
      .map(e => e.delta)
      .join('')

    expect(mockInvoke).toHaveBeenCalled()
    expect(text).toContain('[1](/kb?doc=doc-a&chunk=chunk-a)')
  })
})
