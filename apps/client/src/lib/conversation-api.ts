import type {
  AgentId,
  ConversationIdRequest,
  ConversationMessagesResponse,
  ConversationThread,
  CreateConversationRequest,
} from '@server/shared/conversation'
import {
  ConversationDetailResponseSchema,
  ConversationListResponseSchema,
  ConversationMessagesResponseSchema,
  ConversationMutationResponseSchema,
  CreateConversationResponseSchema,
} from '@server/shared/conversation'
import { getStoredToken } from './auth-client'

async function conversationFetch<T>(
  path: string,
  init: RequestInit,
  parse: (data: unknown) => T,
): Promise<T> {
  const token = getStoredToken()
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (token)
    headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`/api${path}`, { ...init, headers })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = typeof data === 'object' && data != null && 'error' in data
      ? String((data as { error: unknown }).error)
      : res.statusText
    throw new Error(msg || `Request failed: ${res.status}`)
  }
  return parse(data)
}

function conversationIdQuery(id: string): string {
  return `id=${encodeURIComponent(id)}`
}

export async function listConversations(): Promise<ConversationThread[]> {
  const data = await conversationFetch(
    '/conversations/list',
    { method: 'GET' },
    d => ConversationListResponseSchema.parse(d),
  )
  return data.conversations
}

export async function createConversation(agentId: AgentId): Promise<ConversationThread> {
  const body: CreateConversationRequest = { agentId }
  const data = await conversationFetch(
    '/conversations/create',
    { method: 'POST', body: JSON.stringify(body) },
    d => CreateConversationResponseSchema.parse(d),
  )
  return data.conversation
}

export async function getConversationDetail(id: string): Promise<ConversationThread> {
  const data = await conversationFetch(
    `/conversations/detail?${conversationIdQuery(id)}`,
    { method: 'GET' },
    d => ConversationDetailResponseSchema.parse(d),
  )
  return data.conversation
}

export async function getConversationMessages(id: string): Promise<ConversationMessagesResponse> {
  return conversationFetch(
    `/conversations/messages?${conversationIdQuery(id)}`,
    { method: 'GET' },
    d => ConversationMessagesResponseSchema.parse(d),
  )
}

export async function pinConversation(id: string): Promise<void> {
  const body: ConversationIdRequest = { id }
  await conversationFetch(
    '/conversations/pin',
    { method: 'POST', body: JSON.stringify(body) },
    d => ConversationMutationResponseSchema.parse(d),
  )
}

export async function unpinConversation(id: string): Promise<void> {
  const body: ConversationIdRequest = { id }
  await conversationFetch(
    '/conversations/unpin',
    { method: 'POST', body: JSON.stringify(body) },
    d => ConversationMutationResponseSchema.parse(d),
  )
}

export async function deleteConversation(id: string): Promise<void> {
  const body: ConversationIdRequest = { id }
  await conversationFetch(
    '/conversations/delete',
    { method: 'POST', body: JSON.stringify(body) },
    d => ConversationMutationResponseSchema.parse(d),
  )
}
