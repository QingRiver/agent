import { z } from 'zod'

export const TagIdParamSchema = z.object({ id: z.uuid() })

export const TagsListRequestSchema = z.object({}).optional().default({})
export type TagsListRequest = z.infer<typeof TagsListRequestSchema>

export const TagsCreateSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
})
export type TagsCreate = z.infer<typeof TagsCreateSchema>

export const TagsRenameSchema = z.object({ name: z.string().min(1) })
export type TagsRename = z.infer<typeof TagsRenameSchema>

export const TagsUpdateColorSchema = z.object({ color: z.string().nullable() })
export type TagsUpdateColor = z.infer<typeof TagsUpdateColorSchema>

export const TagsDeleteSchema = z.object({
  mode: z.enum(['untag', 'delete_entities']),
  dryRun: z.boolean().optional(),
  docIds: z.array(z.uuid()).optional(),
  taskIds: z.array(z.string().min(1)).optional(),
})
export type TagsDelete = z.infer<typeof TagsDeleteSchema>
