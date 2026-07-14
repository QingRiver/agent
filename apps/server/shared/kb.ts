import { z } from 'zod'

// ---------- 查询/检索（兼容旧入口） ----------

export const KbQueryRequestSchema = z.object({
  query: z.string().min(1),
  kbId: z.string().optional(),
})
export type KbQueryRequest = z.infer<typeof KbQueryRequestSchema>

export const KbIngestPathRequestSchema = z.object({
  path: z.string().min(1),
  kbId: z.string().optional(),
  base: z.string().optional(),
  tags: z.array(z.string()).optional(),
  owner: z.string().optional(),
})
export type KbIngestPathRequest = z.infer<typeof KbIngestPathRequestSchema>

// ---------- 文件夹节点 ----------

export const KbNodeIdParamSchema = z.object({ id: z.string().uuid() })

export const KbCreateNodeSchema = z.object({
  kbId: z.string().min(1).optional(),
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  owner: z.string().optional(),
})
export type KbCreateNode = z.infer<typeof KbCreateNodeSchema>

export const KbUpdateNodeSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().uuid().nullable().optional(),
})
export type KbUpdateNode = z.infer<typeof KbUpdateNodeSchema>

// ---------- 文档草稿 ----------

export const KbDocIdParamSchema = z.object({ id: z.string().uuid() })

/** query parentNodeId：uuid | 字面量 "null"（根级） */
const KbParentNodeIdQuery = z
  .union([z.literal('null'), z.string().uuid()])
  .optional()
  .transform(v => (v === undefined ? undefined : v === 'null' ? null : v))

export const KbListDocsQuerySchema = z.object({
  kbId: z.string().optional(),
  tag: z.string().optional(),
  owner: z.string().optional(),
  vdir: z.string().optional(),
  parentNodeId: KbParentNodeIdQuery,
})
export type KbListDocsQuery = z.infer<typeof KbListDocsQuerySchema>

export const KbCreateDocSchema = z.object({
  kbId: z.string().optional(),
  parentNodeId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  content: z.string().optional(),
  owner: z.string().optional(),
  tags: z.array(z.string()).optional(),
})
export type KbCreateDoc = z.infer<typeof KbCreateDocSchema>

export const KbDraftUpdateSchema = z.object({
  content: z.string().optional(),
  name: z.string().min(1).optional(),
})
export type KbDraftUpdate = z.infer<typeof KbDraftUpdateSchema>

export const KbMetaUpdateSchema = z.object({
  tags: z.array(z.string()).optional(),
  parentNodeId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).optional(),
  owner: z.string().optional(),
  visibility: z.string().optional(),
  pinned: z.boolean().optional(),
})
export type KbMetaUpdate = z.infer<typeof KbMetaUpdateSchema>

/** PATCH /kb/documents/:id：草稿保存（含 content）或元数据更新（二选一，handler 按 content 是否存在分发） */
export const KbDocPatchSchema = KbDraftUpdateSchema.extend(KbMetaUpdateSchema.shape)
export type KbDocPatch = z.infer<typeof KbDocPatchSchema>

export const KbBatchCommitSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  skipEnrich: z.boolean().optional(),
})
export type KbBatchCommit = z.infer<typeof KbBatchCommitSchema>

export const KbCommitSchema = z.object({
  skipEnrich: z.boolean().optional(),
})
export type KbCommit = z.infer<typeof KbCommitSchema>

// ---------- 引入（文本） ----------

export const KbIngestTextSchema = z.object({
  kbId: z.string().optional(),
  content: z.string().min(1),
  name: z.string().min(1),
  parentNodeId: z.string().uuid().nullable().optional(),
  owner: z.string().optional(),
  tags: z.array(z.string()).optional(),
})
export type KbIngestText = z.infer<typeof KbIngestTextSchema>
