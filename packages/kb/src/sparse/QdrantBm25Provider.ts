import type { RetrievedChunk } from '../types'
import type { SparseProvider, SparseSearchOptions } from './SparseProvider'
import { env } from '@agent/env'
import {
  DENSE_VECTOR_NAME,
  getQdrantClient,
  payloadToRetrievedChunk,
  resolveCollectionName,
  SPARSE_VECTOR_NAME,
} from '../qdrant'

export class QdrantBm25Provider implements SparseProvider {
  async search(options: SparseSearchOptions): Promise<RetrievedChunk[]> {
    const client = getQdrantClient()
    const collectionName = resolveCollectionName(options.kbId)
    const exists = await client.collectionExists(collectionName)
    if (!exists.exists)
      return []

    const result = await client.query(collectionName, {
      query: {
        text: options.query,
        model: 'qdrant/bm25',
      },
      using: SPARSE_VECTOR_NAME,
      limit: options.limit,
      with_payload: true,
    })

    return result.points.map((point, index) =>
      payloadToRetrievedChunk(
        (point.payload ?? {}) as Record<string, unknown>,
        point.score ?? 0,
        index + 1,
      ),
    )
  }
}

export async function denseSearch(
  kbId: string,
  denseVector: number[],
  limit: number,
): Promise<RetrievedChunk[]> {
  const client = getQdrantClient()
  const collectionName = resolveCollectionName(kbId)
  const exists = await client.collectionExists(collectionName)
  if (!exists.exists)
    return []

  const result = await client.query(collectionName, {
    query: denseVector,
    using: DENSE_VECTOR_NAME,
    limit,
    with_payload: true,
  })

  return result.points.map((point, index) =>
    payloadToRetrievedChunk(
      (point.payload ?? {}) as Record<string, unknown>,
      point.score ?? 0,
      index + 1,
    ),
  )
}

export const defaultSparseProvider = new QdrantBm25Provider()

export async function denseSearchWithEnv(
  kbId: string,
  denseVector: number[],
  limit = env.KB_RECALL_K,
): Promise<RetrievedChunk[]> {
  return denseSearch(kbId, denseVector, limit)
}
