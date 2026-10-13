import type { AIMessage as AIMessageType, BaseMessage } from '@langchain/core/messages'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { MemorySaver } from '@langchain/langgraph'
import { describe, expect, it, vi } from 'vitest'
import { KB_SEARCH_TOOL_NAME } from '../tools/kb'
import { getAIMessageContent } from '../utils/index'
import {
  clampMaxSteps,
  composeReactAgentSystemPrompt,
  DEFAULT_REACT_AGENT_USER_PROMPT,
  reactAgentGraph,
  readReactAgentRuntimeConfig,
  sanitizeKbId,
  sanitizeUserPrompt,
} from './reactAgent'

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(async () => new AIMessage({
    id: 'react-final-1',
    content: '事件映射层 [1](/kb?doc=doc-a&chunk=chunk-a)。',
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

  it('composeReactAgentSystemPrompt appends skillText when provided', () => {
    const out = composeReactAgentSystemPrompt('用户角色', '## 可用 Skill\n- weather')
    expect(out).toContain('可用 Skill')
    expect(out).toContain('weather')
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

  it('readReactAgentRuntimeConfig reads a runtime config object', () => {
    expect(readReactAgentRuntimeConfig({
      userPrompt: 'from-props',
      kbId: 'kb_lab',
      maxSteps: 12,
    })).toEqual({
      userPrompt: 'from-props',
      kbId: 'kb_lab',
      maxSteps: 12,
    })
    expect(readReactAgentRuntimeConfig({ command: { resume: true } })).toEqual({})
    expect(readReactAgentRuntimeConfig({ maxSteps: 9999 })).toEqual({})
  })

  it('readReactAgentRuntimeConfig keeps skillBindings extras', () => {
    expect(readReactAgentRuntimeConfig({
      userPrompt: 'p',
      kbId: 'kb',
      maxSteps: 12,
      skillText: '## 可用 Skill',
      skillBindings: [{ code: 'bark', strategy: 'latest' }],
    })).toMatchObject({
      userPrompt: 'p',
      skillText: '## 可用 Skill',
      skillBindings: [{ code: 'bark', strategy: 'latest' }],
    })
  })
})

describe('reactAgent kb citation links', () => {
  it('kb_search 之后终答带标准 Markdown 链接', async () => {
    const toolResult = [
      '找到 1 条相关片段：',
      '',
      '[1] 引用请写 `[1](/kb?doc=doc-a&chunk=chunk-a)`',
      '检索结果说明。',
      '',
    ].join('\n')

    const app = reactAgentGraph.compile({
      checkpointer: new MemorySaver(),
    })
    const result = await app.invoke(
      {
        messages: [
          new HumanMessage('解释一下检索'),
          new AIMessage({
            content: '',
            tool_calls: [{
              id: 'call_kb_1',
              name: KB_SEARCH_TOOL_NAME,
              args: { query: '检索' },
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
        configurable: { thread_id: 'react-citation', kbId: 'kb_test' },
        recursionLimit: 8,
      },
    )

    const messages = (result as { messages: BaseMessage[] }).messages
    const ai = [...messages].reverse().find(message => message.getType() === 'ai')
    const text = ai ? getAIMessageContent(ai as AIMessageType) : ''

    expect(mockInvoke).toHaveBeenCalled()
    expect(text).toContain('[1](/kb?doc=doc-a&chunk=chunk-a)')
  })
})
