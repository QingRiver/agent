export const DENSE_VECTOR_NAME = 'dense'
export const SPARSE_VECTOR_NAME = 'text-sparse'
export const DENSE_VECTOR_SIZE = 1024

export const KB_PAYLOAD_INDEX_FIELDS = [
  'source_doc_id',
  'chunk_id',
  'content_hash',
  'keywords',
  'tags',
  'vdir',
  'owner',
] as const

export function resolveCollectionName(kbId: string, prefix = ''): string {
  const normalized = kbId.replace(/[^\w-]/g, '_')
  return `${prefix}${normalized}`
}
