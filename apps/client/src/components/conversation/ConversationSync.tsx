import { useAuth } from '@hooks/useAuth'
import { ConversationStore } from '@stores/conversation-store'
import { useAtomValue } from 'jotai'
import { useEffect } from 'react'

/** 挂载一次：同步 userId、列表与当前会话消息到 Jotai store */
export function ConversationSync() {
  const { user } = useAuth()
  const userId = user?.id
  const activeId = useAtomValue(ConversationStore.activeIdAtom)

  useEffect(() => {
    ConversationStore.onUserIdChange(userId)
  }, [userId])

  useEffect(() => {
    if (!userId || activeId == null)
      return
    void ConversationStore.loadMessages(activeId)
  }, [userId, activeId])

  return null
}
