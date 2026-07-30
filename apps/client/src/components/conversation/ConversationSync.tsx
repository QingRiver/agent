import { useAuth } from '@hooks/useAuth'
import { ConversationStore } from '@stores/conversation-store'
import { useEffect } from 'react'

/** 挂载一次：同步 userId，并由 store 拉取会话列表 */
export function ConversationSync() {
  const { user } = useAuth()
  const userId = user?.id

  useEffect(() => {
    ConversationStore.onUserIdChange(userId)
  }, [userId])

  return null
}
