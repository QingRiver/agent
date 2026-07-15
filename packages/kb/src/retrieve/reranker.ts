import type { RetrievedChunk } from '../types'
import { env } from '@agent/env'
import { z } from 'zod'
import { llmFallbackDecision, rerankDocuments } from '../rerank'
import { hybridRetrieve } from './hybridRetriever'

export interface RerankRetrieveResult {
  chunks: RetrievedChunk[]
  fallback?: {
    decision: 'reject' | 'clarify' | 'retry_wider'
    message: string
  }
}

/** 检索/查询选项 zod schema（字段全可选，给 HTTP body 用） */
export const KbQueryOptionsSchema = z.object({
  /** 是否跳过 rerank */
  skipRerank: z.boolean().optional(),
  /** 召回数量 */
  recallK: z.number().int().positive().optional(),
})
export type KbQueryOptions = z.infer<typeof KbQueryOptionsSchema>

/** retrieveAndRerank 的检索选项（字段全必填，默认值由调用方给出）；由 KbQueryOptionsSchema.required() 派生 */
export type RerankRetrieveOptions = z.infer<ReturnType<typeof KbQueryOptionsSchema.required>>

export async function retrieveAndRerank(
  kbId: string,
  query: string,
  options: RerankRetrieveOptions,
): Promise<RerankRetrieveResult> {
  const recallK = options.recallK

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

  /** 跳过 rerank：直接用 RRF 融合结果取 top-K */
  if (options.skipRerank) {
    return { chunks: recalled.slice(0, env.KB_RERANK_TOPK) }
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

  /** 重排结果得分低于阈值，调用 LLM 决策 fallback */
  const top1Score = topChunks[0]?.rerank_score ?? 0
  if (top1Score < env.KB_RERANK_MIN_SCORE) {
    const fallback = await llmFallbackDecision(query, topChunks)
    return { chunks: topChunks, fallback }
  }

  return { chunks: topChunks }
}
