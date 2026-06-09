import type { UseConversationsResult } from '../contexts/conversations-types'
import { use } from 'react'
import { ConversationsContext } from '../contexts/conversations-context'

export function useConversations(): UseConversationsResult {
  const ctx = use(ConversationsContext)
  if (!ctx)
    throw new Error('useConversations must be used within ConversationsProvider')
  return ctx
}

export type { UseConversationsResult }
