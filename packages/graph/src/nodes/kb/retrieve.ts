import type { RetrievedChunk } from '@agent/kb'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import type { KbStateType } from '../../state/kbState'
import { env } from '@agent/env'
import { retrieveAndRerank } from '@agent/kb'
import { AIMessage } from '@langchain/core/messages'
import { lastUserMessage } from './lastUserMessage'

function getKbId(config: LangGraphRunnableConfig): string {
  const configurable = config.configurable as { kbId?: string } | undefined
  return configurable?.kbId ?? env.KB_COLLECTION
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

export async function kbRetrieveNode(
  state: KbStateType,
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
