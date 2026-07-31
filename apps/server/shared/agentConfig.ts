import {
  REACT_AGENT_MAX_STEPS_MAX,
  REACT_AGENT_MAX_STEPS_MIN,
  REACT_AGENT_USER_PROMPT_MAX,
} from '@agent/graph'
import { z } from 'zod'

export const UpsertAgentConfigRequestSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  name: z.string().min(1).max(80),
  description: z.string().max(200).optional().default(''),
  userPrompt: z.string().max(REACT_AGENT_USER_PROMPT_MAX),
  kbId: z.string().min(1).max(128),
  maxSteps: z.number().int().min(REACT_AGENT_MAX_STEPS_MIN).max(REACT_AGENT_MAX_STEPS_MAX),
})

export type UpsertAgentConfigRequest = z.infer<typeof UpsertAgentConfigRequestSchema>

export const AgentConfigIdQuerySchema = z.object({
  id: z.string().min(1).max(128),
})
