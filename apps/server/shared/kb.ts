import { KbQueryOptionsSchema } from '@agent/kb'
import { z } from 'zod'

export { type KbQueryOptions, KbQueryOptionsSchema } from '@agent/kb'

export const KbQueryRequestSchema = z.object({
  query: z.string().min(1),
  kbId: z.string().min(1),
  options: KbQueryOptionsSchema.optional(),
})
export type KbQueryRequest = z.infer<typeof KbQueryRequestSchema>

// ---------- 文件夹节点 ----------

export const KbNodeIdParamSchema = z.object({ id: z.uuid() })

export const KbCreateNodeSchema = z.object({
  kbId: z.string().min(1),
  parentId: z.uuid().nullable().optional(),
  name: z.string().min(1),
  owner: z.string().optional(),
})
export type KbCreateNode = z.infer<typeof KbCreateNodeSchema>

export const KbListNodesRequestSchema = z.object({ kbId: z.string().min(1) })
export type KbListNodesRequest = z.infer<typeof KbListNodesRequestSchema>

/** rename：name 必填 */
export const KbRenameNodeSchema = z.object({ name: z.string().min(1) })
export type KbRenameNode = z.infer<typeof KbRenameNodeSchema>

/** move：parentId 必填（目标父，string），移到根级走 move-to-root 无 body */
export const KbMoveNodeSchema = z.object({ parentId: z.uuid() })
export type KbMoveNode = z.infer<typeof KbMoveNodeSchema>

// ---------- 文档草稿 ----------

export const KbDocIdParamSchema = z.object({ id: z.uuid() })

export const KbListDocsRequestSchema = z.object({
  kbId: z.string().min(1),
  tagId: z.string().optional(),
  owner: z.string().optional(),
  vdirPrefix: z.string().optional(),
  parentNodeId: z.uuid().nullable().optional(),
})
export type KbListDocsRequest = z.infer<typeof KbListDocsRequestSchema>

export const KbGetDocByVdirSchema = z.object({
  kbId: z.string().min(1),
  vdir: z.string().min(1),
})
export type KbGetDocByVdir = z.infer<typeof KbGetDocByVdirSchema>

export const KbCreateDocSchema = z.object({
  kbId: z.string().min(1),
  parentNodeId: z.uuid().nullable().optional(),
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
  parentNodeId: z.uuid().nullable().optional(),
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
  kbId: z.string().min(1),
  content: z.string().min(1),
  name: z.string().min(1),
  parentNodeId: z.uuid().nullable().optional(),
  owner: z.string().optional(),
  tags: z.array(z.string()).default([]),
})
export type KbIngestText = z.infer<typeof KbIngestTextSchema>
