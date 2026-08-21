import type { ReactNode } from 'react'
import { useAuth } from '@hooks/useAuth'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

const PUBLIC_PATHS = new Set(['/login', '/register'])

interface RequireAuthProps {
  children: ReactNode
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { user, token, isLoading } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isPublic = PUBLIC_PATHS.has(pathname)
  /** token 在会话瞬断耗尽后仍保留：视为已登录，避免误踢登录页 */
  const authed = user != null || token != null

  useEffect(() => {
    if (isLoading || isPublic)
      return
    if (!authed)
      void navigate({ to: '/login' })
  }, [isLoading, isPublic, authed, navigate])

  useEffect(() => {
    if (isLoading || !authed || !isPublic)
      return
    void navigate({ to: '/' })
  }, [isLoading, isPublic, authed, navigate])

  if (isPublic)
    return <>{children}</>

  if (isLoading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center text-muted-foreground">
        加载中…
      </main>
    )
  }

  if (!authed)
    return null

  return <>{children}</>
}
