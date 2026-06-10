import type { ReactNode } from 'react'
import { authClient, getStoredToken, setStoredToken } from '@apis/auth-client'
import { createContext, useCallback, useEffect, useMemo, useState } from 'react'

export interface AuthUser {
  id: string
  email: string
  name: string
  image?: string | null
}

export interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [isLoading, setIsLoading] = useState(true)

  const refreshSession = useCallback(async () => {
    const stored = getStoredToken()
    setToken(stored)
    if (!stored) {
      setUser(null)
      return
    }

    const { data } = await authClient.getSession()
    setUser(data?.user ?? null)
    if (!data?.user)
      setStoredToken(null)
  }, [])

  useEffect(() => {
    refreshSession().finally(() => setIsLoading(false))
  }, [refreshSession])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await authClient.signIn.email({ email, password })
    if (error)
      throw new Error(error.message ?? '登录失败')
    await refreshSession()
    setToken(getStoredToken())
  }, [refreshSession])

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { error } = await authClient.signUp.email({ email, password, name })
    if (error)
      throw new Error(error.message ?? '注册失败')
    await refreshSession()
    setToken(getStoredToken())
  }, [refreshSession])

  const signOut = useCallback(async () => {
    await authClient.signOut()
    setStoredToken(null)
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    token,
    isLoading,
    signIn,
    signUp,
    signOut,
  }), [user, token, isLoading, signIn, signUp, signOut])

  return (
    <AuthContext value={value}>
      {children}
    </AuthContext>
  )
}
