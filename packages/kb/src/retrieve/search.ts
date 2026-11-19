import type { RetrievedChunk } from '../types'
import { env } from '@agent/env'
import { rewriteQuery } from './queryRewrite'
import { retrieveAndRerank } from './reranker'

export const KB_NOT_FOUND_MESSAGE
  = '知识库中未找到相关内容。若尚未导入文档，请先通过 /kb/ingest 导入后再试。'

export type KbSearchOutcome
  = | { kind: 'hits', chunks: RetrievedChunk[] }
    | { kind: 'clarify', message: string }
    | { kind: 'empty' }

export interface SearchKnowledgeBaseOptions {
  /** 已改写查询；缺省则内部调用 rewriteQuery(query) */
  queries?: string[]
  recallK?: number
}

/**
 * 统一知识库检索管线：改写（可选）→ 混合召回 + rerank → clarify / retry_wider。
 * 供 `kbGraph` 节点与 `kb_search` 工具共用，避免双轨漂移。
 */
export async function searchKnowledgeBase(
  kbId: string,
  query: string,
  options?: SearchKnowledgeBaseOptions,
): Promise<KbSearchOutcome> {
  const recallK = options?.recallK ?? env.KB_RECALL_K
  const queries = options?.queries?.length
    ? options.queries
    : ((await rewriteQuery(query)) ?? [query])

  const chunkMap = new Map<string, RetrievedChunk>()

  for (const q of queries) {
    const result = await retrieveAndRerank(kbId, q, {
      skipRerank: false,
      recallK,
    })

    if (result.fallback?.decision === 'clarify')
      return { kind: 'clarify', message: result.fallback.message }

    for (const chunk of result.chunks)
      chunkMap.set(`${chunk.source_doc_id}:${chunk.chunk_id}`, chunk)

    if (result.fallback?.decision === 'retry_wider') {
      const wider = await retrieveAndRerank(kbId, q, {
        skipRerank: false,
        recallK: recallK * 2,
      })
      for (const chunk of wider.chunks)
        chunkMap.set(`${chunk.source_doc_id}:${chunk.chunk_id}`, chunk)
      if (wider.fallback?.decision === 'clarify')
        return { kind: 'clarify', message: wider.fallback.message }
    }

    if (chunkMap.size)
      break
  }

  if (!chunkMap.size)
    return { kind: 'empty' }

  return { kind: 'hits', chunks: [...chunkMap.values()] }
}
