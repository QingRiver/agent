import type { RetrievedChunk } from '../types'
import { env } from '@agent/env'
import { llmFallbackDecision, rerankDocuments } from '../rerank'
import { hybridRetrieve } from './hybridRetriever'

export interface RerankRetrieveResult {
  chunks: RetrievedChunk[]
  fallback?: {
    decision: 'reject' | 'clarify' | 'retry_wider'
    message: string
  }
}

export async function retrieveAndRerank(
  kbId: string,
  query: string,
  options?: { recallK?: number, widerRecall?: boolean },
): Promise<RerankRetrieveResult> {
  const recallK = options?.widerRecall
    ? (options.recallK ?? env.KB_RECALL_K) * 2
    : (options?.recallK ?? env.KB_RECALL_K)

  const recalled = await hybridRetrieve({ kbId, query, recallK })
  if (!recalled.length) {
    return {
      chunks: [],
      fallback: {
        decision: 'reject',
        message: '知识库中未找到相关内容。',
      },
    }
  }

  const reranked = await rerankDocuments(
    query,
    recalled.map(chunk => ({
      id: `${chunk.source_doc_id}:${chunk.chunk_id}`,
      text: chunk.raw_text,
    })),
    env.KB_RERANK_TOPK,
  )

  const chunkById = new Map(
    recalled.map(chunk => [`${chunk.source_doc_id}:${chunk.chunk_id}`, chunk]),
  )

  const topChunks: RetrievedChunk[] = []
  for (const item of reranked) {
    const chunk = chunkById.get(item.id)
    if (!chunk)
      continue
    topChunks.push({
      ...chunk,
      rerank_score: item.relevance_score,
      score: item.relevance_score,
    })
  }

  const top1Score = topChunks[0]?.rerank_score ?? 0
  if (top1Score < env.KB_RERANK_MIN_SCORE) {
    const fallback = await llmFallbackDecision(query, topChunks)
    return { chunks: topChunks, fallback }
  }

  return { chunks: topChunks }
}
