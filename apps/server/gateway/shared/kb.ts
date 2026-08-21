import { KbQueryOptionsSchema } from '@agent/kb'
import { z } from 'zod'

export { type KbQueryOptions, KbQueryOptionsSchema } from '@agent/kb'

export const KbQueryRequestSchema = z.object({
  query: z.string().min(1),
  /** 分区标签（默认 kb_default）；已废 kbId 隔离，全局单 collection，此值仅记录 */
  kbId: z.string().optional(),
  options: KbQueryOptionsSchema.optional(),
})
export type KbQueryRequest = z.infer<typeof KbQueryRequestSchema>

// ---------- 文档草稿 ----------

export const KbDocIdParamSchema = z.object({ id: z.uuid() })

export const KbListDocsRequestSchema = z.object({
  /** 仅列挂载到该 dir 的文档 */
  dirId: z.uuid().optional(),
  /** 含子树全部 dir 下文档（dirId 必填） */
  includeDescendants: z.boolean().optional(),
  tagId: z.string().optional(),
  owner: z.string().optional(),
})
export type KbListDocsRequest = z.infer<typeof KbListDocsRequestSchema>

export const KbCreateDocSchema = z.object({
  /** 分区标签（默认 kb_default）；已废 kbId 隔离，仅记录 */
  kbId: z.string().optional(),
  /** 挂载 dirs.id；null/缺省=Inbox */
  mountDirId: z.uuid().nullable().optional(),
  name: z.string().min(1),
  content: z.string().optional(),
  owner: z.string().optional(),
  tagIds: z.array(z.string()).default([]),
})
export type KbCreateDoc = z.infer<typeof KbCreateDocSchema>

export const KbDraftUpdateSchema = z.object({
  content: z.string().optional(),
  name: z.string().min(1).optional(),
})
export type KbDraftUpdate = z.infer<typeof KbDraftUpdateSchema>

export const KbMetaUpdateSchema = z.object({
  tagIds: z.array(z.string()).optional(),
  /** 挂载 dirs.id；null=移到 Inbox。位置变 → setPayload({mount_dir_id, project_id})，不重 embed */
  mountDirId: z.uuid().nullable().optional(),
  name: z.string().min(1).optional(),
  owner: z.string().optional(),
  visibility: z.string().optional(),
  pinned: z.boolean().optional(),
})
export type KbMetaUpdate = z.infer<typeof KbMetaUpdateSchema>

export const KbBatchCommitSchema = z.object({
  ids: z.array(z.uuid()).min(1),
  skipEnrich: z.boolean().optional(),
})
export type KbBatchCommit = z.infer<typeof KbBatchCommitSchema>

export const KbCommitSchema = z.object({
  skipEnrich: z.boolean().optional(),
})
export type KbCommit = z.infer<typeof KbCommitSchema>

// ---------- 引入（文本） ----------

export const KbIngestTextSchema = z.object({
  content: z.string().min(1),
  name: z.string().min(1),
  /** 挂载 dirs.id；null/缺省=Inbox */
  mountDirId: z.uuid().nullable().optional(),
  owner: z.string().optional(),
  tags: z.array(z.string()).default([]),
})
export type KbIngestText = z.infer<typeof KbIngestTextSchema>
