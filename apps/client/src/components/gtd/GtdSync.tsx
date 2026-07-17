import { useAuth } from '@hooks/useAuth'
import { GtdStore } from '@stores/gtd-store'
import { useEffect } from 'react'

/** 挂在 /gtd 页内：登录后拉取 GtdDocument */
export function GtdSync() {
  const { user } = useAuth()
  const userId = user?.id

  useEffect(() => {
    void GtdStore.onUserIdChange(userId)
  }, [userId])

  return null
}
