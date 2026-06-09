import type { AgentId, AgUiMessage, ConversationThread, ThreadState } from '@server/shared/conversation'

export interface UseConversationsResult {
  conversations: ConversationThread[]
  activeId: string | null
  active: ConversationThread | null
  activeMessages: AgUiMessage[] | null
  threadState: ThreadState | null
  isLoading: boolean
  messagesLoading: boolean
  error: string | null
  select: (id: string) => void
  create: (agentId: AgentId) => Promise<ConversationThread>
  pin: (id: string) => Promise<void>
  unpin: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  refresh: () => Promise<void>
  reloadActiveThread: () => Promise<void>
}
