import type { WriterChangeSummary } from '@agent/protocol'
import type { BaseMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import process from 'node:process'
import { computeHunks, WRITER_CHANGE_SUMMARIES_EVENT, WriterHunkSummariesSchema } from '@agent/protocol'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { Annotation, StateGraph } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'

export { WRITER_CHANGE_SUMMARIES_EVENT, type WriterChangeSummary } from '@agent/protocol'

const WriterState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
})

const WRITER_SYSTEM_PROMPT = [
  '你是一位资深中文文字编辑。',
  '任务：对用户给出的原文进行润色，直接输出润色后的完整文本。',
  '要求：',
  '1) 修正语病、错别字、标点错误；',
  '2) 提升表达流畅度与书面感，但不改变原意与事实信息；',
  '3) 保持原文段落结构与长度比例，不增删实质内容；',
  '4) 只输出润色后的完整文本，不要任何解释、前缀、markdown 代码块。',
].join('\n')

const SUMMARY_SYSTEM_PROMPT = [
  '你是一位资深中文文字编辑。',
  '下面给你一组「修改 hunk」,每项含索引、原文片段(originalText)与润色后片段(newText)。',
  '请按索引顺序,为每一项给出不超过 20 字的修改说明(如「修正错别字」「优化句式」「统一标点」)。',
  '严格输出 summaries 数组,长度与输入 hunk 数量一致、顺序一一对应,不要任何额外字段或解释。',
].join('\n')

const llm = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? '',
  temperature: 0.7,
})

const summaryLlm = llm.withStructuredOutput(WriterHunkSummariesSchema, {
  name: 'writer_hunk_summaries',
})

function messageText(message: BaseMessage | undefined): string {
  if (!message)
    return ''
  const { content } = message
  return typeof content === 'string' ? content : ''
}

async function summarizeHunks(original: string, polished: string): Promise<WriterChangeSummary[]> {
  const hunks = computeHunks(original, polished).filter(h => h.originalText || h.newText)
  if (!hunks.length)
    return []
  const payload = hunks.map((h, i) => ({
    index: i,
    originalText: h.originalText || '(纯插入)',
    newText: h.newText || '(纯删除)',
  }))
  const { summaries } = await summaryLlm.invoke([
    new SystemMessage(SUMMARY_SYSTEM_PROMPT),
    new HumanMessage(JSON.stringify(payload, null, 2)),
  ])
  return hunks.map((h, i) => ({
    hintFrom: h.from,
    originalText: h.originalText,
    newText: h.newText,
    // LLM 输出长度可能不齐,缺项留空字符串,client 侧显示「修订建议」兜底
    summary: summaries[i]?.trim() ?? '',
  }))
}

async function writer(
  state: typeof WriterState.State,
  config: LangGraphRunnableConfig,
) {
  const latestUser = [...state.messages].reverse().find(m => m.getType() === 'human')
  const original = messageText(latestUser)
  const polishMessages = latestUser
    ? [new SystemMessage(WRITER_SYSTEM_PROMPT), latestUser]
    : [new SystemMessage(WRITER_SYSTEM_PROMPT)]
  const response = await llm.invoke(polishMessages)
  const polished = messageText(response)

  if (original.trim() && polished.trim()) {
    const changes = await summarizeHunks(original, polished)
    config.writer?.({
      name: WRITER_CHANGE_SUMMARIES_EVENT,
      payload: { changes } satisfies { changes: WriterChangeSummary[] },
    })
  }

  return { messages: [response] }
}

export const writerGraph = new StateGraph(WriterState)
  .addNode('writer', writer)
  .addEdge('__start__', 'writer')
  .addEdge('writer', '__end__')
