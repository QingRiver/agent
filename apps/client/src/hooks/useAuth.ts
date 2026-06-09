import type { AuthContextValue } from '../contexts/auth-types'
import { use } from 'react'
import { AuthContext } from '../contexts/auth-context'

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext)
  if (!ctx)
    throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
