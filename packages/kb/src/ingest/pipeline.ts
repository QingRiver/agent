import type { KbChunk } from '../types'
import { randomUUID } from 'node:crypto'
import { embedTexts } from '../embedding'
import { upsertChunks } from '../qdrant'

/**
 * 只做 embed + upsert（point id 由调用方指定，= kb_chunks.id 的 uuid）。
 * 供 KbService.commit 复用：source_doc_id 用外部稳定 uuid，与路径/内容解耦。
 */
export async function embedAndUpsert(args: {
  kbId: string
  docId: string
  vdir?: string
  owner?: string
  tags?: string[]
  chunks: KbChunk[]
  pointIds: string[]
}): Promise<void> {
  const { kbId, docId, chunks, pointIds, ...meta } = args
  if (chunks.length !== pointIds.length)
    throw new Error(`embedAndUpsert: chunks (${chunks.length}) 与 pointIds (${pointIds.length}) 长度不一致`)

  const vectors = await embedTexts(chunks.map(chunk => chunk.raw_text))
  await upsertChunks(
    kbId,
    chunks.map((chunk, index) => ({
      pointId: pointIds[index] ?? randomUUID(),
      chunk,
      docId,
      ...(meta.vdir !== undefined ? { vdir: meta.vdir } : {}),
      ...(meta.owner !== undefined ? { owner: meta.owner } : {}),
      ...(meta.tags ? { tags: meta.tags } : {}),
      denseVector: vectors[index] ?? [],
    })),
  )
}
