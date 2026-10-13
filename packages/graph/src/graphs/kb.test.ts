import type { AIMessage, BaseMessage } from '@langchain/core/messages'
import { randomUUID } from 'node:crypto'
import { AIMessage as AIMessageClass, HumanMessage } from '@langchain/core/messages'
import { MemorySaver } from '@langchain/langgraph'
import { describe, expect, it, vi } from 'vitest'
import { getAIMessageContent } from '../utils/index'
import { kbGraph } from './kb'

const { mockInvoke, retrieveAndRerank } = vi.hoisted(() => ({
  mockInvoke: vi.fn(async () => new AIMessageClass({
    id: 'stream-msg-1',
    content: '登录企业门户申请电子发票 [1]。',
  })),
  retrieveAndRerank: vi.fn(),
}))

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    invoke = mockInvoke
  },
}))

vi.mock('@agent/kb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agent/kb')>()
  return {
    ...actual,
    rewriteQuery: vi.fn(async (q: string) => [q]),
    retrieveAndRerank,
    validateCitations: vi.fn(() => ({
      ok: true,
      citations: [{
        index: 1,
        chunk_id: 'doc#1',
        source_doc_id: 'doc',
        heading_path: ['FAQ'],
        excerpt: '财务中心',
      }],
      invalidIndices: [],
    })),
  }
})

const chunk = {
  chunk_id: 'doc#1',
  source_doc_id: 'doc',
  heading_path: ['FAQ'],
  raw_text: '登录企业门户，在「财务中心」提交申请。',
  score: 0.9,
  rerank_score: 0.9,
}

async function lastAssistantText(
  app: ReturnType<typeof kbGraph.compile>,
  threadId: string,
) {
  const snapshot = await app.getState({ configurable: { thread_id: threadId } })
  const messages = snapshot.values.messages as BaseMessage[]
  const ai = [...messages].reverse().find(message => message.getType() === 'ai')
  return ai ? getAIMessageContent(ai as AIMessage) : ''
}

describe('kbGraph', () => {
  it('compiles with checkpointer', () => {
    expect(() => kbGraph.compile({
      checkpointer: new MemorySaver(),
    })).not.toThrow()
  })

  it('首轮空检索有回复；第二轮命中后不因 routeRejected 残留而静默结束', async () => {
    retrieveAndRerank
      .mockResolvedValueOnce({
        chunks: [],
        fallback: { decision: 'reject', message: '知识库中未找到相关内容。' },
      })
      .mockResolvedValueOnce({ chunks: [chunk] })

    const threadId = `kb-${randomUUID()}`
    const app = kbGraph.compile({
      checkpointer: new MemorySaver(),
    })
    await app.invoke(
      { messages: [new HumanMessage('怎么开电子发票')] },
      { configurable: { thread_id: threadId, kbId: 'kb_test' } },
    )
    expect(await lastAssistantText(app, threadId)).toContain('未找到')

    await app.invoke(
      { messages: [new HumanMessage('怎么开电子发票')] },
      { configurable: { thread_id: threadId, kbId: 'kb_test' } },
    )
    const secondText = await lastAssistantText(app, threadId)
    expect(mockInvoke).toHaveBeenCalled()
    expect(secondText).toContain('企业门户')
    expect(secondText).toMatch(/企业门户|\[1\]/)
  })
})
