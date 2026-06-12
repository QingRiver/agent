import type { GraphsName } from '@agent/graph'
import type { InferRequestType, InferResponseType } from 'hono/client'
import type { api } from './api-client'

export type { GraphsName }

type Conversations = typeof api.conversations

export type GraphAgentCatalogResponse = InferResponseType<Conversations['graphs']['$get'], 200>
export type GraphAgentCatalogItem = GraphAgentCatalogResponse['graphs'][number]

export type ConversationListResponse = InferResponseType<Conversations['list']['$get'], 200>
export type ConversationThread = ConversationListResponse['conversations'][number]

export type CreateConversationBody = InferRequestType<Conversations['create']['$post']>['json']

export type CreateConversationResponse = InferResponseType<Conversations['create']['$post'], 200>

export type ConversationDetailResponse = InferResponseType<Conversations['detail']['$get'], 200>

export type ConversationMessagesResponse = InferResponseType<Conversations['messages']['$get'], 200>
export type AgUiMessage = ConversationMessagesResponse['messages'][number]
export type ThreadState = ConversationMessagesResponse['threadState']
