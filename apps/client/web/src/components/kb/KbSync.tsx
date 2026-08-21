import { useAuth } from '@hooks/useAuth'
import { KbStore } from '@stores/kb-store'
import { useEffect } from 'react'

/** 挂在 /kb 页内：登录后拉树/列表/标签 */
export function KbSync() {
  const { user } = useAuth()
  const userId = user?.id

  useEffect(() => {
    KbStore.onUserIdChange(userId)
  }, [userId])

  return null
}
