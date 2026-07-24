import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import type { KbStateType } from '../../state/kbState'
import process from 'node:process'
import { buildContextFromChunks, validateCitations } from '@agent/kb'
import { KB_CITATIONS_EVENT } from '@agent/protocol'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { MAX_CITATION_RETRIES } from '../../state/kbState'
import { getAIMessageContent } from '../../utils'
import { lastUserMessage } from './lastUserMessage'

const llm = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? '',
  temperature: 0.2,
})

function buildGenerateSystemPrompt(context: string): string {
  return [
    '你是企业知识库问答助手。仅根据下方检索片段回答用户问题。',
    '回答末尾对关键事实使用 [n] 标注引用，n 为片段编号。',
    '不要编造检索片段中不存在的信息。',
    '',
    '检索片段：',
    context,
  ].join('\n')
}

/** 生成答案；校验通过时由本节点 emit citations CUSTOM */
export async function kbGenerateNode(
  state: KbStateType,
  config: LangGraphRunnableConfig,
) {
  const userQuery = lastUserMessage(state.messages)
  const context = buildContextFromChunks(state.retrievedChunks)
  const correction = state.citationRetries > 0
    ? state.messages.at(-1)?.content
    : undefined

  const messages = [
    new SystemMessage(buildGenerateSystemPrompt(context)),
    new HumanMessage(userQuery),
  ]
  if (typeof correction === 'string' && correction.trim())
    messages.push(new HumanMessage(correction))

  const response = await llm.invoke(messages)
  const answer = getAIMessageContent(response as AIMessage)
  const validation = validateCitations(answer, state.retrievedChunks)

  if (!validation.ok && state.citationRetries < MAX_CITATION_RETRIES) {
    return {
      messages: [new HumanMessage(validation.correctionPrompt ?? '请修正引用后重答。')],
      citationRetries: state.citationRetries + 1,
    }
  }

  if (!validation.ok) {
    return {
      messages: [new AIMessage('抱歉，无法生成通过引文校验的答案，请换个问法重试。')],
      citations: [],
    }
  }

  config.writer?.({
    name: KB_CITATIONS_EVENT,
    payload: { citations: validation.citations },
  })

  return {
    messages: [response as AIMessage],
    citations: validation.citations,
  }
}
