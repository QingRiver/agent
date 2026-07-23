import { ThemeStore } from '@stores/theme-store'
import { useEffect } from 'react'

/** 挂载时 bootstrap；保证 class 与用户主题 style 与 store 一致 */
export function ThemeSync() {
  useEffect(() => {
    ThemeStore.bootstrap()
  }, [])

  return null
}
