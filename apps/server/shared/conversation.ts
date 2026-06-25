import type { Message } from '@ag-ui/core'
import { GraphsNameSchema } from '@agent/graph'
import { z } from 'zod'

export type { GraphsName } from '@agent/graph'
export { GraphsNameSchema } from '@agent/graph'

// 中断协议类型/schema 由 @agent/protocol 统一维护，此处 re-export 保持 server 内 import 路径不变
export {
  type ApprovalDecision,
  ApprovalDecisionSchema,
  type PendingInterrupt,
  PendingInterruptSchema,
  type ThreadState,
} from '@agent/protocol'

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
