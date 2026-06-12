import type { Message } from '@ag-ui/core'
import { GraphsNameSchema } from '@agent/graph'
import { z } from 'zod'

export type { GraphsName } from '@agent/graph'
export { GraphsNameSchema } from '@agent/graph'

export const ConversationIdSchema = z.string().uuid()
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

/** AG-UI `Message`（checkpoint hydrate / connect snapshot 共用） */
export type AgUiMessage = Message

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

/** LangGraph checkpoint 中挂起的 HITL 审批（由 getState hydrate，非 DB 投影） */
export const PendingInterruptSchema = z.object({
  interruptId: z.string(),
  type: z.literal('approval'),
  message: z.string(),
  details: z.string(),
})
export type PendingInterrupt = z.infer<typeof PendingInterruptSchema>

/** 图执行态：checkpoints.sqlite 为唯一真相源 */
export interface ThreadState {
  pendingInterrupt: PendingInterrupt | null
}
