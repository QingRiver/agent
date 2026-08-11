import { env } from '@agent/env'

export const DENSE_VECTOR_NAME = 'dense'
export const SPARSE_VECTOR_NAME = 'text-sparse'
export const DENSE_VECTOR_SIZE = 1024

/**
 * Qdrant payload 中建索引的字段。文档级 summary/keywords/toc 事实源在 PG；
 * Qdrant 保留检索过滤字段 + chunk 正文 `raw_text`（检索直接用，不做 PG hydrate）：
 * source_doc_id/doc_id（=文档稳定 uuid）、chunk_id（= point id）、
 * mount_dir_id/project_id（子树/项目召回 id 过滤，认 id 不认 name）、owner/tag_ids（权限/标签过滤）。
 * **不存 vdir**（name 链改名抖动 + 写放大；展示用 vdir 据 mount_dir_id 查 dirs 重派生）。
 */
export const KB_PAYLOAD_INDEX_FIELDS = [
  'source_doc_id',
  'doc_id',
  'chunk_id',
  'mount_dir_id',
  'project_id',
  'owner',
  'tag_ids',
] as const

/**
 * 废弃 kbId 隔离：所有 chunk 进单一全局 collection（env.KB_COLLECTION）。
 * kbId 参数保留签名兼容但忽略。多用户/多 kb 靠 payload 的 owner/mount_dir_id/project_id 区分。
 */
export function resolveCollectionName(_kbId?: string, prefix = ''): string {
  return `${prefix}${env.KB_COLLECTION}`
}
