import type { UseConversationsResult } from './conversations-types'
import { createContext } from 'react'

export const ConversationsContext = createContext<UseConversationsResult | null>(null)
