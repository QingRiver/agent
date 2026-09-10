import { VERSION_TEXT_TYPES } from '@agent/proto'
import { z } from 'zod'

export const SkillCreateSchema = z.object({
  dirId: z.string().min(1).max(128),
  code: z.string().min(1).max(64).optional(),
})
export type SkillCreate = z.infer<typeof SkillCreateSchema>

export const SkillIdParamSchema = z.object({
  id: z.string().min(1).max(128),
})

export {
  VERSION_TEXT_TYPE,
  VERSION_TEXT_TYPES,
  type VersionTextType,
} from '@agent/proto'

export const VersionTextTypeSchema = z.enum(VERSION_TEXT_TYPES)

export const VersionTextUpsertSchema = z.object({
  dirId: z.string().min(1).max(128),
  filename: z.string().min(1).max(200),
  content: z.string(),
  type: VersionTextTypeSchema.optional(),
})
export type VersionTextUpsert = z.infer<typeof VersionTextUpsertSchema>

export const VersionTextListSchema = z.object({
  dirId: z.string().min(1).max(128),
  type: VersionTextTypeSchema.optional(),
})

export const VersionTextListVersionsSchema = z.object({
  dirId: z.string().min(1).max(128),
  filename: z.string().min(1).max(200),
})
export type VersionTextListVersions = z.infer<typeof VersionTextListVersionsSchema>

export const VersionTextPublishSchema = z.object({
  dirId: z.string().min(1).max(128),
  filename: z.string().min(1).max(200),
  versionDesc: z.string().max(500).optional(),
})
export type VersionTextPublish = z.infer<typeof VersionTextPublishSchema>

export const VersionTextGetSchema = z.object({
  dirId: z.string().min(1).max(128),
  filename: z.string().min(1).max(200),
  version: z.number().int().min(0),
})
export type VersionTextGet = z.infer<typeof VersionTextGetSchema>

export const VersionTextIdParamSchema = z.object({
  id: z.string().min(1).max(128),
})

export const SkillSetTagsSchema = z.object({
  tagIds: z.array(z.string().min(1).max(128)).max(64),
})
export type SkillSetTags = z.infer<typeof SkillSetTagsSchema>

export const VersionTextListAllSchema = z.object({
  type: VersionTextTypeSchema.optional(),
}).optional().default({})
