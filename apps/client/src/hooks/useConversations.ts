import { ConversationStore } from '@stores/conversation-store'
import { useAtomValue } from 'jotai'

export function useConversations() {
  const conversations = useAtomValue(ConversationStore.conversationsAtom)
  const activeId = useAtomValue(ConversationStore.activeIdAtom)
  const active = useAtomValue(ConversationStore.activeAtom)
  const activeMessages = useAtomValue(ConversationStore.activeMessagesAtom)
  const threadState = useAtomValue(ConversationStore.threadStateAtom)
  const isLoading = useAtomValue(ConversationStore.isLoadingAtom)
  const messagesLoading = useAtomValue(ConversationStore.showMessagesLoadingAtom)
  const error = useAtomValue(ConversationStore.errorAtom)

  return {
    conversations,
    activeId,
    active,
    activeMessages,
    threadState,
    isLoading,
    messagesLoading,
    error,
    select: ConversationStore.select,
    create: ConversationStore.create,
    pin: ConversationStore.pin,
    unpin: ConversationStore.unpin,
    remove: ConversationStore.remove,
    refresh: ConversationStore.refresh,
    reloadActiveThread: ConversationStore.reloadActiveThread,
  }
}
