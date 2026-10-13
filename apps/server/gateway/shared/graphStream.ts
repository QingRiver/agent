import { GraphsNameSchema } from '@agent/graph'
import { z } from 'zod'

const LangGraphWireMessageSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['human', 'ai', 'system', 'tool']),
  content: z.union([z.string(), z.array(z.unknown())]),
}).passthrough()

export const GraphStreamRequestSchema = z.object({
  threadId: z.string().min(1),
  messages: z.array(LangGraphWireMessageSchema).optional().default([]),
  command: z.object({
    resume: z.unknown(),
  }).optional(),
  configurable: z.record(z.string(), z.unknown()).optional(),
})

export type GraphStreamRequest = z.infer<typeof GraphStreamRequestSchema>

export const GraphStateQuerySchema = z.object({
  threadId: z.string().min(1),
})

export type GraphStateQuery = z.infer<typeof GraphStateQuerySchema>

export const GraphStreamNameParamSchema = z.object({
  name: GraphsNameSchema,
})
