import { GraphsNameSchema } from '@agent/graph'
import { z } from 'zod'

export { GraphsNameSchema } from '@agent/graph'

export const ConversationIdSchema = z.uuid()
export type ConversationId = z.infer<typeof ConversationIdSchema>

/** GET query 或 POST body：`{ id }` */
export const ConversationIdRequestSchema = z.object({
  id: ConversationIdSchema,
})
export type ConversationIdRequest = z.infer<typeof ConversationIdRequestSchema>

export const CreateConversationRequestSchema = z.object({
  agentId: GraphsNameSchema,
})
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>

export const ConversationThreadSchema = z.object({
  id: ConversationIdSchema,
  agentId: GraphsNameSchema,
  title: z.string(),
  pinned: z.boolean(),
  seq: z.number().int().positive(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})
export type ConversationThread = z.infer<typeof ConversationThreadSchema>
