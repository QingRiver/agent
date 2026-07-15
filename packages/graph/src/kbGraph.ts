import type { RetrievedChunk } from '@agent/kb'
import type { KbCitation } from '@agent/protocol'
import type { BaseMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import process from 'node:process'
import { env } from '@agent/env'
import {
  buildContextFromChunks,
  retrieveAndRerank,
  rewriteQuery,
  validateCitations,
} from '@agent/kb'
import { KB_CITATIONS_EVENT } from '@agent/protocol'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { Annotation, StateGraph } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import { getAIMessageContent } from './utils'

export { KB_CITATIONS_EVENT } from '@agent/protocol'

const MAX_CITATION_RETRIES = 2

const KbState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  rewrittenQueries: Annotation<string[]>({
    reducer: (_x, y) => y,
    default: () => [],
  }),
  retrievedChunks: Annotation<RetrievedChunk[]>({
    reducer: (_x, y) => y,
    default: () => [],
  }),
  citations: Annotation<KbCitation[]>({
    reducer: (_x, y) => y,
    default: () => [],
  }),
  routeRejected: Annotation<boolean>({
    reducer: (_x, y) => y,
    default: () => false,
  }),
  citationRetries: Annotation<number>({
    reducer: (_x, y) => y,
    default: () => 0,
  }),
})

const llm = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? '',
  temperature: 0.2,
})

function lastUserMessage(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || message.getType() !== 'human')
      continue
    const content = message.content
    if (typeof content === 'string' && content.trim())
      return content.trim()
  }
  return ''
}

function getKbId(config: LangGraphRunnableConfig): string {
  const configurable = config.configurable as { kbId?: string } | undefined
  return configurable?.kbId ?? env.KB_COLLECTION
}

async function rewriteNode(state: typeof KbState.State) {
  const userQuery = lastUserMessage(state.messages)
  const rewrittenQueries = await rewriteQuery(userQuery)
  return {
    rewrittenQueries,
    routeRejected: false,
    citationRetries: 0,
    retrievedChunks: [],
    citations: [],
  }
}

async function mergeRetrieveResult(
  chunkMap: Map<string, RetrievedChunk>,
  kbId: string,
  query: string,
): Promise<{ clarifyMessage?: string, retryWider?: boolean }> {
  const result = await retrieveAndRerank(kbId, query, {
    skipRerank: false,
    recallK: env.KB_RECALL_K,
  })

  if (result.fallback?.decision === 'clarify')
    return { clarifyMessage: result.fallback.message }

  if (result.fallback?.decision === 'retry_wider') {
    const wider = await retrieveAndRerank(kbId, query, {
      skipRerank: false,
      recallK: env.KB_RECALL_K * 2,
    })
    for (const chunk of wider.chunks) {
      const key = `${chunk.source_doc_id}:${chunk.chunk_id}`
      if (!chunkMap.has(key))
        chunkMap.set(key, chunk)
    }
    if (wider.fallback?.decision === 'clarify')
      return { clarifyMessage: wider.fallback.message }
    return { retryWider: true }
  }

  for (const chunk of result.chunks) {
    const key = `${chunk.source_doc_id}:${chunk.chunk_id}`
    if (!chunkMap.has(key))
      chunkMap.set(key, chunk)
  }

  return {}
}

async function retrieveNode(
  state: typeof KbState.State,
  config: LangGraphRunnableConfig,
) {
  const kbId = getKbId(config)
  const userQuery = lastUserMessage(state.messages)
  const queries = state.rewrittenQueries.length
    ? state.rewrittenQueries
    : [userQuery]

  const chunkMap = new Map<string, RetrievedChunk>()

  for (const query of queries) {
    const outcome = await mergeRetrieveResult(chunkMap, kbId, query)
    if (outcome.clarifyMessage) {
      return {
        messages: [new AIMessage(outcome.clarifyMessage)],
        routeRejected: true,
      }
    }
    if (chunkMap.size)
      break
  }

  if (!chunkMap.size) {
    return {
      messages: [new AIMessage(
        '知识库中未找到相关内容。若尚未导入文档，请先通过 /kb/ingest 导入后再试。',
      )],
      routeRejected: true,
      retrievedChunks: [],
    }
  }

  return {
    retrievedChunks: [...chunkMap.values()],
    routeRejected: false,
  }
}

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

async function generateNode(
  state: typeof KbState.State,
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

  // 复用 invoke 返回的 AIMessage（保留流式 messageId），避免 handleChainEnd 再 emit 一条 run-* 重复消息
  return {
    messages: [response as AIMessage],
    citations: validation.citations,
  }
}

function afterRetrieve(state: typeof KbState.State): 'generate' | '__end__' {
  if (state.routeRejected)
    return '__end__'
  if (!state.retrievedChunks.length)
    return 'generate'
  return 'generate'
}

function afterGenerate(state: typeof KbState.State): 'generate' | '__end__' {
  const last = state.messages.at(-1)
  if (last?.getType() === 'human' && state.citationRetries > 0 && state.citationRetries <= MAX_CITATION_RETRIES)
    return 'generate'
  return '__end__'
}

export const kbGraph = new StateGraph(KbState)
  .addNode('rewrite', rewriteNode)
  .addNode('retrieve', retrieveNode)
  .addNode('generate', generateNode)
  .addEdge('__start__', 'rewrite')
  .addEdge('rewrite', 'retrieve')
  .addConditionalEdges('retrieve', afterRetrieve)
  .addConditionalEdges('generate', afterGenerate)
