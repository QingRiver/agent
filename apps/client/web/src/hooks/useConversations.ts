import { ConversationStore } from '@stores/conversation-store'
import { useAtomValue } from 'jotai'

export function useConversations() {
  const conversations = useAtomValue(ConversationStore.conversationsAtom)
  const activeId = useAtomValue(ConversationStore.activeIdAtom)
  const active = useAtomValue(ConversationStore.activeAtom)
  const isLoading = useAtomValue(ConversationStore.isLoadingAtom)
  const error = useAtomValue(ConversationStore.errorAtom)

  return {
    conversations,
    activeId,
    active,
    isLoading,
    error,
    select: ConversationStore.select,
    create: ConversationStore.create,
    pin: ConversationStore.pin,
    unpin: ConversationStore.unpin,
    remove: ConversationStore.remove,
    refresh: ConversationStore.refresh,
  }
}
