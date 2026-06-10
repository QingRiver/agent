import type { ReactNode } from 'react'
import { useAuth } from '@hooks/useAuth'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

const PUBLIC_PATHS = new Set(['/login', '/register'])

interface RequireAuthProps {
  children: ReactNode
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { user, isLoading } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isPublic = PUBLIC_PATHS.has(pathname)

  useEffect(() => {
    if (isLoading || isPublic)
      return
    if (!user)
      void navigate({ to: '/login' })
  }, [isLoading, isPublic, user, navigate])

  useEffect(() => {
    if (isLoading || !user || !isPublic)
      return
    void navigate({ to: '/' })
  }, [isLoading, isPublic, user, navigate])

  if (isPublic)
    return <>{children}</>

  if (isLoading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center text-muted-foreground">
        加载中…
      </main>
    )
  }

  if (!user)
    return null

  return <>{children}</>
}
