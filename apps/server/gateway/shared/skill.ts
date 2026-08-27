import { z } from 'zod'

export const SkillCreateSchema = z.object({
  dirId: z.string().min(1).max(128),
  code: z.string().min(1).max(64).optional(),
})
export type SkillCreate = z.infer<typeof SkillCreateSchema>

export const SkillIdParamSchema = z.object({
  id: z.string().min(1).max(128),
})

export const VersionTextUpsertSchema = z.object({
  dirId: z.string().min(1).max(128),
  filename: z.string().min(1).max(200),
  content: z.string(),
})
export type VersionTextUpsert = z.infer<typeof VersionTextUpsertSchema>

export const VersionTextListSchema = z.object({
  dirId: z.string().min(1).max(128),
})

export const VersionTextIdParamSchema = z.object({
  id: z.string().min(1).max(128),
})

export const SkillSetTagsSchema = z.object({
  tagIds: z.array(z.string().min(1).max(128)).max(64),
})
export type SkillSetTags = z.infer<typeof SkillSetTagsSchema>

export const VersionTextListAllSchema = z.object({}).optional().default({})
