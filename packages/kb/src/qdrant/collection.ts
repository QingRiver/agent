export const DENSE_VECTOR_NAME = 'dense'
export const SPARSE_VECTOR_NAME = 'text-sparse'
export const DENSE_VECTOR_SIZE = 1024

/**
 * Qdrant payload 中建索引的字段。文档级 summary/keywords/toc 事实源在 PG；
 * Qdrant 保留检索过滤字段 + chunk 正文 `raw_text`（检索直接用，不做 PG hydrate）：
 * source_doc_id/doc_id（=文档稳定 uuid）、chunk_id（= point id）、
 * vdir/owner/tags（子树/权限/标签过滤）。
 */
export const KB_PAYLOAD_INDEX_FIELDS = [
  'source_doc_id',
  'doc_id',
  'chunk_id',
  'vdir',
  'owner',
  'tags',
] as const

export function resolveCollectionName(kbId: string, prefix = ''): string {
  const normalized = kbId.replace(/[^\w-]/g, '_')
  return `${prefix}${normalized}`
}
