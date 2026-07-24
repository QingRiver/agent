import type { TextMessageContentEvent } from '@ag-ui/core'
import type { AguiMappedEvent } from '../stream'
import { randomUUID } from 'node:crypto'
import { EventType } from '@ag-ui/core'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { MemorySaver } from '@langchain/langgraph'
import { describe, expect, it, vi } from 'vitest'
import { aguiRunContext, aguiTransformerFactory } from '../stream'
import { kbGraph } from './kb'

const { mockInvoke, retrieveAndRerank } = vi.hoisted(() => ({
  mockInvoke: vi.fn(async () => new AIMessage({
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

vi.mock('@agent/kb', () => ({
  rewriteQuery: vi.fn(async (q: string) => [q]),
  retrieveAndRerank,
  buildContextFromChunks: vi.fn((chunks: Array<{ raw_text: string }>) =>
    chunks.map((chunk, index) => `[${index + 1}] ${chunk.raw_text}`).join('\n')),
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
}))

const chunk = {
  chunk_id: 'doc#1',
  source_doc_id: 'doc',
  heading_path: ['FAQ'],
  raw_text: '登录企业门户，在「财务中心」提交申请。',
  score: 0.9,
  rerank_score: 0.9,
}

async function runKbTurn(
  app: ReturnType<typeof kbGraph.compile>,
  threadId: string,
  userText: string,
) {
  const runId = randomUUID()
  aguiRunContext.current = { threadId, runId }
  try {
    const stream = await app.streamEvents(
      { messages: [new HumanMessage(userText)] },
      { version: 'v3', configurable: { thread_id: threadId, kbId: 'kb_test' } },
    )
    const protocolDone = (async () => {
      for await (const _ of stream) { /* drain */ }
    })()
    const events = await Array.fromAsync(
      stream.extensions.aguiEvents as AsyncIterable<AguiMappedEvent>,
    )
    await protocolDone
    return events
  }
  finally {
    delete aguiRunContext.current
  }
}

describe('kbGraph', () => {
  it('compiles with checkpointer and transformer', () => {
    expect(() => kbGraph.compile({
      checkpointer: new MemorySaver(),
      transformers: [aguiTransformerFactory],
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
      transformers: [aguiTransformerFactory],
    })
    const first = await runKbTurn(app, threadId, '怎么开电子发票')
    const firstText = first
      .filter((e): e is TextMessageContentEvent => e.type === EventType.TEXT_MESSAGE_CONTENT)
      .map(e => e.delta)
      .join('')
    expect(firstText).toContain('未找到')

    const second = await runKbTurn(app, threadId, '怎么开电子发票')
    const secondText = second
      .filter((e): e is TextMessageContentEvent => e.type === EventType.TEXT_MESSAGE_CONTENT)
      .map(e => e.delta)
      .join('')
    expect(mockInvoke).toHaveBeenCalled()
    expect(secondText).toContain('企业门户')

    const textStarts = second.filter(e => e.type === EventType.TEXT_MESSAGE_START)
    expect(textStarts).toHaveLength(1)
  })
})
