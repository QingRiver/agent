import { z } from 'zod'

/** 与 CopilotKit 注册的 agent id 对齐 */
export const AGENT_ID_VALUES = [
  'simple',
  'simpleToolCall',
  'weather',
  'hitl',
  'obsidian',
] as const

export const AgentIdSchema = z.enum(AGENT_ID_VALUES)
export type AgentId = z.infer<typeof AgentIdSchema>

export const ConversationIdSchema = z.string().uuid()
export type ConversationId = z.infer<typeof ConversationIdSchema>

/** GET query 或 POST body：`{ id }` */
export const ConversationIdRequestSchema = z.object({
  id: ConversationIdSchema,
})
export type ConversationIdRequest = z.infer<typeof ConversationIdRequestSchema>

/** AG-UI Message JSON（首版宽松校验） */
export const AgUiMessageSchema = z.record(z.string(), z.unknown())
export type AgUiMessage = z.infer<typeof AgUiMessageSchema>

export const ConversationThreadSchema = z.object({
  id: ConversationIdSchema,
  agentId: AgentIdSchema,
  title: z.string(),
  pinned: z.boolean(),
  seq: z.number().int().positive(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})
export type ConversationThread = z.infer<typeof ConversationThreadSchema>

export const ConversationListResponseSchema = z.object({
  conversations: z.array(ConversationThreadSchema),
})
export type ConversationListResponse = z.infer<typeof ConversationListResponseSchema>

export const CreateConversationRequestSchema = z.object({
  agentId: AgentIdSchema,
})
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>

export const CreateConversationResponseSchema = z.object({
  conversation: ConversationThreadSchema,
})
export type CreateConversationResponse = z.infer<typeof CreateConversationResponseSchema>

export const ConversationDetailResponseSchema = z.object({
  conversation: ConversationThreadSchema,
})
export type ConversationDetailResponse = z.infer<typeof ConversationDetailResponseSchema>

/** LangGraph checkpoint 中挂起的 HITL 审批（由 getState hydrate，非 DB 投影） */
export const PendingInterruptSchema = z.object({
  interruptId: z.string(),
  type: z.literal('approval'),
  message: z.string(),
  details: z.string(),
})
export type PendingInterrupt = z.infer<typeof PendingInterruptSchema>

/** 图执行态：checkpoints.sqlite 为唯一真相源 */
export const ThreadStateSchema = z.object({
  pendingInterrupt: PendingInterruptSchema.nullable(),
})
export type ThreadState = z.infer<typeof ThreadStateSchema>

export const ConversationMessagesResponseSchema = z.object({
  messages: z.array(AgUiMessageSchema),
  threadState: ThreadStateSchema,
})
export type ConversationMessagesResponse = z.infer<typeof ConversationMessagesResponseSchema>

export const ConversationMutationResponseSchema = z.object({
  ok: z.literal(true),
})
export type ConversationMutationResponse = z.infer<typeof ConversationMutationResponseSchema>
