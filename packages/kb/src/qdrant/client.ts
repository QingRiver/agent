import type { KbChunk, KbDocumentMeta } from '../types'
import { createHash } from 'node:crypto'
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

export function chunkPointId(sourceDocId: string, chunkId: string): string {
  return createHash('sha256').update(`${sourceDocId}:${chunkId}`).digest('hex').slice(0, 32)
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
      field_schema: field === 'keywords' || field === 'tags'
        ? 'keyword'
        : 'keyword',
    })
  }

  return collectionName
}

export interface UpsertChunkInput {
  chunk: KbChunk
  docMeta: KbDocumentMeta
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

  const points = items.map(({ chunk, docMeta, denseVector }) => ({
    id: chunkPointId(chunk.source_doc_id, chunk.chunk_id),
    vector: {
      [DENSE_VECTOR_NAME]: denseVector,
      [SPARSE_VECTOR_NAME]: {
        text: chunk.raw_text,
        model: 'qdrant/bm25',
      },
    } satisfies Record<string, unknown>,
    payload: {
      source_doc_id: chunk.source_doc_id,
      chunk_id: chunk.chunk_id,
      page_number: chunk.page_number,
      heading_path: chunk.heading_path,
      raw_text: chunk.raw_text,
      content_hash: docMeta.content_hash,
      keywords: docMeta.keywords,
      tags: docMeta.tags,
      vdir: docMeta.vdir,
      owner: docMeta.owner,
      summary: docMeta.summary,
      faq: docMeta.faq,
      toc: docMeta.toc,
      filename: docMeta.filename,
    },
  }))

  await client.upsert(collectionName, { wait: true, points })
}

export async function deleteByDocId(kbId: string, sourceDocId: string): Promise<void> {
  const client = getQdrantClient()
  const collectionName = resolveCollectionName(kbId)
  const exists = await client.collectionExists(collectionName)
  if (!exists.exists)
    return

  await client.delete(collectionName, {
    wait: true,
    filter: {
      must: [{ key: 'source_doc_id', match: { value: sourceDocId } }],
    },
  })
}

export async function getStoredContentHash(
  kbId: string,
  sourceDocId: string,
): Promise<string | null> {
  const client = getQdrantClient()
  const collectionName = resolveCollectionName(kbId)
  const exists = await client.collectionExists(collectionName)
  if (!exists.exists)
    return null

  const result = await client.scroll(collectionName, {
    limit: 1,
    with_payload: true,
    filter: {
      must: [{ key: 'source_doc_id', match: { value: sourceDocId } }],
    },
  })

  const point = result.points[0]
  if (!point?.payload)
    return null

  const hash = point.payload.content_hash
  return typeof hash === 'string' ? hash : null
}

export interface ScrollDocSummary {
  source_doc_id: string
  filename: string
  content_hash: string
  chunk_count: number
  summary?: string
  tags: string[]
  vdir?: string
  owner?: string
}

export async function listDocumentSummaries(kbId: string): Promise<ScrollDocSummary[]> {
  const client = getQdrantClient()
  const collectionName = resolveCollectionName(kbId)
  const exists = await client.collectionExists(collectionName)
  if (!exists.exists)
    return []

  const byDoc = new Map<string, ScrollDocSummary>()
  let offset: string | number | null | undefined

  for (;;) {
    const page = await client.scroll(collectionName, {
      limit: 100,
      with_payload: true,
      ...(offset != null ? { offset } : {}),
    })

    for (const point of page.points) {
      const payload = point.payload ?? {}
      const sourceDocId = String(payload.source_doc_id ?? '')
      if (!sourceDocId)
        continue

      const existing = byDoc.get(sourceDocId)
      if (existing) {
        existing.chunk_count += 1
        continue
      }

      const summary = typeof payload.summary === 'string' ? payload.summary : undefined
      const vdir = typeof payload.vdir === 'string' ? payload.vdir : undefined
      const owner = typeof payload.owner === 'string' ? payload.owner : undefined

      byDoc.set(sourceDocId, {
        source_doc_id: sourceDocId,
        filename: String(payload.filename ?? sourceDocId),
        content_hash: String(payload.content_hash ?? ''),
        chunk_count: 1,
        tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
        ...(summary ? { summary } : {}),
        ...(vdir ? { vdir } : {}),
        ...(owner ? { owner } : {}),
      })
    }

    if (page.next_page_offset == null)
      break
    offset = page.next_page_offset as string | number
  }

  return [...byDoc.values()]
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
