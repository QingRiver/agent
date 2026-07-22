import type { GtdDocument } from './schema'
import { GtdDocumentSchema } from './schema'

/**
 * 导入 / 导出。整体 JSON 序列化，zod 校验。
 */

/** 导出：GtdDocument → JSON 字符串（经 GtdDocumentSchema 校验） */
export function serialize(doc: GtdDocument): string {
  return JSON.stringify(GtdDocumentSchema.parse(doc))
}

/** 导入：JSON 字符串 → GtdDocument（GtdDocumentSchema.parse，失败抛 ZodError） */
export function parse(json: string): GtdDocument {
  return GtdDocumentSchema.parse(JSON.parse(json))
}

/** 版本迁移（spec 阶段占位）：按 meta.schemaVersion 链式迁移到 toVersion */
export function migrate(_doc: GtdDocument, _toVersion: string): GtdDocument {
  throw new Error('not implemented: migrate')
}
