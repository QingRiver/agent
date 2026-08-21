import { GraphsNameSchema } from '@agent/graph'
import { z } from 'zod'

export const GraphRunRequestSchema = z.object({
  threadId: z.string().min(1),
  runId: z.string().min(1).optional(),
  state: z.record(z.string(), z.unknown()).optional().default({}),
  forwardedProps: z.record(z.string(), z.unknown()).optional().default({}),
  messages: z.array(z.object({
    id: z.string().min(1),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).optional().default([]),
})

export type GraphRunRequest = z.infer<typeof GraphRunRequestSchema>

export const GraphRunNameParamSchema = z.object({
  name: GraphsNameSchema,
})
