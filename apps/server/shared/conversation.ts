import { z } from 'zod'

/** 与 CopilotKit 注册的 agent id 对齐 */
export const AGENT_ID_VALUES = [
  'claudeAgent',
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

export const CreateConversationRequestSchema = z.object({
  agentId: AgentIdSchema,
})
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>

/** AG-UI Message JSON（首版宽松） */
export type AgUiMessage = Record<string, unknown>

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
