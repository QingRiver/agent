import type { ObsidianSearchResult } from '@agent/tools'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { vi } from 'vitest'
import { MAX_SEARCH_RESULTS, OBSIDIAN_SEARCH_TOOL_NAME, obsidianGraph } from './obsidianGraph'
import { getAIMessageContent } from './utils'

const { mockSearchNotes, mockMiniInvoke, mockMainInvoke, chatOpenAICallIndex } = vi.hoisted(() => ({
  mockSearchNotes: vi.fn(),
  mockMiniInvoke: vi.fn(),
  mockMainInvoke: vi.fn(),
  chatOpenAICallIndex: { value: 0 },
}))

vi.mock('@agent/tools', () => ({
  obsidian: {
    searchNotes: (...args: unknown[]) => mockSearchNotes(...args),
  },
}))

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    const isMini = chatOpenAICallIndex.value++ > 0
    if (isMini) {
      this.invoke = mockMiniInvoke
      return
    }
    this.invoke = mockMainInvoke
    this.bindTools = vi.fn(() => ({ invoke: mockMainInvoke }))
  }),
}))

const searchFixture: ObsidianSearchResult[] = [
  {
    score: 99.77,
    vault: 'doc',
    path: 'src/子类型.md',
    basename: '子类型',
    foundWords: ['子集'],
    matches: [{ match: '子集', offset: 42 }],
    excerpt: '## 子集<br>子集的定义也是有两个类别的',
  },
]

describe('obsidianGraph', () => {
  const app = obsidianGraph.compile()

  beforeEach(() => {
    vi.clearAllMocks()
    chatOpenAICallIndex.value = 0
    mockSearchNotes.mockResolvedValue(searchFixture)
    mockMiniInvoke.mockResolvedValue({ content: '- 子集有两个类别' })
  })

  it('tool 用 search_keywords 检索并 rewrite，主 Agent 继续回答', async () => {
    mockMainInvoke
      .mockResolvedValueOnce(new AIMessage({
        content: '',
        tool_calls: [{
          id: 'call_1',
          name: OBSIDIAN_SEARCH_TOOL_NAME,
          args: { search_keywords: '子集', user_question: '子集是什么？' },
        }],
      }))
      .mockResolvedValueOnce(new AIMessage({ content: '根据知识库，子集有两个类别。' }))

    const result = await app.invoke({
      messages: [new HumanMessage('子集是什么？')],
    })

    expect(mockSearchNotes).toHaveBeenCalledWith('子集')
    expect(mockMiniInvoke).toHaveBeenCalledTimes(1)
    const toolMessages = result.messages.filter((m: { type: string }) => m.type === 'tool')
    expect(toolMessages[0]?.content).toBe('- 子集有两个类别')
    expect(getAIMessageContent(result.messages.at(-1)! as AIMessage)).toBe('根据知识库，子集有两个类别。')
  })

  it(`slice(0, ${MAX_SEARCH_RESULTS}) 后传给 rewrite`, async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...searchFixture[0]!, path: `src/doc-${i}.md` }))
    mockSearchNotes.mockResolvedValue(many)
    mockMainInvoke
      .mockResolvedValueOnce(new AIMessage({
        content: '',
        tool_calls: [{
          id: 'call_1',
          name: OBSIDIAN_SEARCH_TOOL_NAME,
          args: { search_keywords: '子集', user_question: '子集是什么？' },
        }],
      }))
      .mockResolvedValueOnce(new AIMessage({ content: 'ok' }))

    await app.invoke({ messages: [new HumanMessage('子集是什么？')] })

    const prompt = (mockMiniInvoke.mock.calls[0]?.[0] as Array<{ content: string }>)?.[0]?.content ?? ''
    expect(prompt.match(/### 文档 \d/g)?.length).toBe(MAX_SEARCH_RESULTS)
  })

  it('搜索无结果时不调用 mini LLM', async () => {
    mockSearchNotes.mockResolvedValue([])
    mockMainInvoke
      .mockResolvedValueOnce(new AIMessage({
        content: '',
        tool_calls: [{
          id: 'call_1',
          name: OBSIDIAN_SEARCH_TOOL_NAME,
          args: { search_keywords: '不存在', user_question: '不存在是什么？' },
        }],
      }))
      .mockResolvedValueOnce(new AIMessage({ content: '未找到' }))

    await app.invoke({ messages: [new HumanMessage('不存在是什么？')] })

    expect(mockMiniInvoke).not.toHaveBeenCalled()
  })
})
