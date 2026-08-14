import { useAuth } from '@hooks/useAuth'
import { TagsStore } from '@stores/tags-store'
import { useEffect } from 'react'

/**
 * 挂在需要标签目录的页（/gtd、/kb）内：登录后 bootstrap TagsStore.refreshTags()，
 * 登出 reset()。与 DirSync 同构——标签目录已退出 GTD sync。
 */
export function TagSync() {
  const { user } = useAuth()
  const userId = user?.id

  useEffect(() => {
    if (!userId) {
      TagsStore.reset()
      return
    }
    void TagsStore.refreshTags()
  }, [userId])

  return null
}
