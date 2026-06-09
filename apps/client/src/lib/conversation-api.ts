import type {
  AgentId,
  ConversationDetailResponse,
  ConversationListResponse,
  ConversationMessagesResponse,
  ConversationThread,
  CreateConversationResponse,
} from './api-types'
import { api, throwIfApiError } from './api-client'

export type { AgentId, ConversationMessagesResponse, ConversationThread }

export async function listConversations(): Promise<ConversationThread[]> {
  const res = await api.conversations.list.$get()
  await throwIfApiError(res)
  const data = await res.json() as ConversationListResponse
  return data.conversations
}

export async function createConversation(agentId: AgentId): Promise<ConversationThread> {
  const res = await api.conversations.create.$post({ json: { agentId } })
  await throwIfApiError(res)
  const data = await res.json() as CreateConversationResponse
  return data.conversation
}

export async function getConversationDetail(id: string): Promise<ConversationThread> {
  const res = await api.conversations.detail.$get({ query: { id } })
  await throwIfApiError(res)
  const data = await res.json() as ConversationDetailResponse
  return data.conversation
}

export async function getConversationMessages(id: string): Promise<ConversationMessagesResponse> {
  const res = await api.conversations.messages.$get({ query: { id } })
  await throwIfApiError(res)
  return await res.json() as ConversationMessagesResponse
}

export async function pinConversation(id: string): Promise<void> {
  const res = await api.conversations.pin.$post({ json: { id } })
  await throwIfApiError(res)
}

export async function unpinConversation(id: string): Promise<void> {
  const res = await api.conversations.unpin.$post({ json: { id } })
  await throwIfApiError(res)
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await api.conversations.delete.$post({ json: { id } })
  await throwIfApiError(res)
}
