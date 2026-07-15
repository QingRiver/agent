import type { SparseProvider } from '../sparse'
import type { RetrievedChunk } from '../types'
import { env } from '@agent/env'
import { embedQuery } from '../embedding'
import { defaultSparseProvider, denseSearch } from '../sparse'

const RRF_K = 60

export interface HybridRetrieveOptions {
  kbId: string
  query: string
  recallK?: number
  sparseProvider?: SparseProvider
}

/** 混合召回 */
export async function hybridRetrieve(
  options: HybridRetrieveOptions,
): Promise<RetrievedChunk[]> {
  const recallK = options.recallK ?? env.KB_RECALL_K
  const sparseProvider = options.sparseProvider ?? defaultSparseProvider

  const [denseVector, sparseHits] = await Promise.all([
    embedQuery(options.query),
    sparseProvider.search({
      kbId: options.kbId,
      query: options.query,
      limit: recallK,
    }),
  ])

  const denseHits = await denseSearch(options.kbId, denseVector, recallK)
  return rrfFusion([denseHits, sparseHits], recallK)
}

/** RRF 融合 */
export function rrfFusion(
  rankedLists: RetrievedChunk[][],
  topK: number,
  k = RRF_K,
): RetrievedChunk[] {
  const scores = new Map<string, { chunk: RetrievedChunk, score: number }>()

  for (const list of rankedLists) {
    list.forEach((chunk, index) => {
      const rank = chunk.rank ?? index + 1
      const contribution = 1 / (k + rank)
      const key = `${chunk.source_doc_id}:${chunk.chunk_id}`
      const existing = scores.get(key)
      if (existing) {
        existing.score += contribution
        existing.chunk.score = existing.score
      }
      else {
        scores.set(key, {
          chunk: { ...chunk, score: contribution },
          score: contribution,
        })
      }
    })
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(item => item.chunk)
}
