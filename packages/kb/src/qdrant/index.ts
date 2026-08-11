import type { Schemas } from '@qdrant/js-client-rest'

/** Qdrant Filter 条件结构；召回 filter 骨架透传用（待接作用域构造）。 */
export type KbRecallFilter = Schemas['Filter']

export {
  deleteByPointIds,
  ensureCollection,
  getQdrantClient,
  payloadToRetrievedChunk,
  setPayloadByDocId,
  type UpsertChunkInput,
  upsertChunks,
} from './client'
export {
  DENSE_VECTOR_NAME,
  DENSE_VECTOR_SIZE,
  KB_PAYLOAD_INDEX_FIELDS,
  resolveCollectionName,
  SPARSE_VECTOR_NAME,
} from './collection'
