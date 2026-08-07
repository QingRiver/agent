import { useAuth } from '@hooks/useAuth'
import { DirStore } from '@stores/dir-store'
import { useEffect } from 'react'

/**
 * 挂在需要统一 dirs 树的页（/kb、/gtd）内：登录后 bootstrap DirStore.refresh()，
 * 登出 reset()。Phase 1 遗留：DirStore.refresh() 此前仅 mutation 后调，无外部引导。
 */
export function DirSync() {
  const { user } = useAuth()
  const userId = user?.id

  useEffect(() => {
    if (!userId) {
      DirStore.reset()
      return
    }
    void DirStore.refresh()
  }, [userId])

  return null
}
