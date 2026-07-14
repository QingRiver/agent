import type { KbChunk } from '../types'
import { env } from '@agent/env'
import { QdrantClient } from '@qdrant/js-client-rest'
import {
  DENSE_VECTOR_NAME,
  DENSE_VECTOR_SIZE,
  KB_PAYLOAD_INDEX_FIELDS,
  resolveCollectionName,
  SPARSE_VECTOR_NAME,
} from './collection'

let sharedClient: QdrantClient | null = null

export function getQdrantClient(): QdrantClient {
  if (!sharedClient)
    sharedClient = new QdrantClient({ url: env.QDRANT_URL })
  return sharedClient
}

export async function ensureCollection(kbId: string): Promise<string> {
  const client = getQdrantClient()
  const collectionName = resolveCollectionName(kbId)

  const exists = await client.collectionExists(collectionName)
  if (exists.exists)
    return collectionName

  await client.createCollection(collectionName, {
    vectors: {
      [DENSE_VECTOR_NAME]: {
        size: DENSE_VECTOR_SIZE,
        distance: 'Cosine',
      },
    },
    sparse_vectors: {
      [SPARSE_VECTOR_NAME]: {
        modifier: 'idf',
      },
    },
  })

  for (const field of KB_PAYLOAD_INDEX_FIELDS) {
    await client.createPayloadIndex(collectionName, {
      field_name: field,
      field_schema: 'keyword',
    })
  }

  return collectionName
}

export interface UpsertChunkInput {
  /** Qdrant point id，由调用方指定（= kb_chunks.id 的 uuid），不再派生 */
  pointId: string
  chunk: KbChunk
  /** 文档稳定 id（= source_doc_id = kb_documents.id） */
  docId: string
  vdir?: string
  owner?: string
  tags?: string[]
  denseVector: number[]
}

export async function upsertChunks(
  kbId: string,
  items: UpsertChunkInput[],
): Promise<void> {
  if (!items.length)
    return

  const client = getQdrantClient()
  const collectionName = await ensureCollection(kbId)

  const points = items.map(({ pointId, chunk, docId, vdir, owner, tags, denseVector }) => ({
    id: pointId,
    vector: {
      [DENSE_VECTOR_NAME]: denseVector,
      [SPARSE_VECTOR_NAME]: {
        text: chunk.raw_text,
        model: 'qdrant/bm25',
      },
    } satisfies Record<string, unknown>,
    payload: {
      source_doc_id: docId,
      doc_id: docId,
      chunk_id: pointId,
      raw_text: chunk.raw_text,
      heading_path: chunk.heading_path,
      ...(chunk.page_number !== undefined ? { page_number: chunk.page_number } : {}),
      ...(vdir !== undefined ? { vdir } : {}),
      ...(owner !== undefined ? { owner } : {}),
      ...(tags ? { tags } : {}),
    },
  }))

  await client.upsert(collectionName, { wait: true, points })
}

/**
 * 按 point id 列表删除（PG 驱动：从 kb_chunks.id 取出后调用）。
 * 这是新模型删文档/重建的主路径，不依赖 Qdrant filter scan，永不孤儿。
 */
export async function deleteByPointIds(kbId: string, pointIds: string[]): Promise<void> {
  if (!pointIds.length)
    return
  const client = getQdrantClient()
  const collectionName = resolveCollectionName(kbId)
  const exists = await client.collectionExists(collectionName)
  if (!exists.exists)
    return

  await client.delete(collectionName, {
    wait: true,
    points: pointIds,
  })
}

/**
 * 按文档 id 批量更新 payload（如移动文档后同步 vdir）。
 * 只改 payload，不重 embed。未传字段保持原值。
 */
export async function setPayloadByDocId(
  kbId: string,
  docId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!Object.keys(patch).length)
    return
  const client = getQdrantClient()
  const collectionName = resolveCollectionName(kbId)
  const exists = await client.collectionExists(collectionName)
  if (!exists.exists)
    return

  await client.setPayload(collectionName, {
    wait: true,
    payload: patch,
    filter: {
      must: [{ key: 'source_doc_id', match: { value: docId } }],
    },
  })
}

export function payloadToRetrievedChunk(
  payload: Record<string, unknown>,
  score: number,
  rank?: number,
): import('../types').RetrievedChunk {
  const pageNumber = typeof payload.page_number === 'number' ? payload.page_number : undefined
  return {
    chunk_id: String(payload.chunk_id ?? ''),
    source_doc_id: String(payload.source_doc_id ?? ''),
    heading_path: Array.isArray(payload.heading_path) ? payload.heading_path.map(String) : [],
    raw_text: String(payload.raw_text ?? ''),
    score,
    ...(pageNumber !== undefined ? { page_number: pageNumber } : {}),
    ...(rank !== undefined ? { rank } : {}),
  }
}
