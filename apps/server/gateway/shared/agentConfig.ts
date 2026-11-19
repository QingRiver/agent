import { ReactAgentRuntimeConfigSchema } from '@agent/graph'
import { z } from 'zod'

export const UpsertAgentConfigRequestSchema = ReactAgentRuntimeConfigSchema.extend({
  id: z.string().min(1).max(128).optional(),
  name: z.string().min(1).max(80),
  description: z.string().max(200).optional().default(''),
  skillCodes: z.array(z.string().min(1).max(64)).max(32).optional().default([]),
})

export type UpsertAgentConfigRequest = z.infer<typeof UpsertAgentConfigRequestSchema>

export const AgentConfigIdQuerySchema = z.object({
  id: z.string().min(1).max(128),
})

export function toAgentConfigDto(record: {
  id: string
  name: string
  description: string
  userPrompt: string
  kbId: string
  maxSteps: number
  skillCodes: string[]
  updatedAt: number
}) {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    userPrompt: record.userPrompt,
    kbId: record.kbId,
    maxSteps: record.maxSteps,
    skillCodes: record.skillCodes,
    updatedAt: record.updatedAt,
  }
}
