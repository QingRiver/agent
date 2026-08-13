import type { ReactNode } from 'react'
import { authClient, getStoredToken, setStoredToken } from '@apis/auth-client'
import { createContext, useEffect, useRef, useState } from 'react'

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

const RETRY_MS = [400, 1000, 2000]

function isUnauthorized(error: { status?: number, statusCode?: number } | null | undefined): boolean {
  const status = error?.status ?? error?.statusCode
  return status === 401 || status === 403
}

async function loadSession() {
  try {
    return await authClient.getSession()
  }
  catch {
    return null
  }
}

async function wait(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [isLoading, setIsLoading] = useState(true)
  /** 丢弃过期 refresh：signOut / 新一次 refresh 递增后，旧 attempt 不得再 setState */
  const refreshGenRef = useRef(0)

  async function refreshSession(): Promise<void> {
    const gen = ++refreshGenRef.current
    const stored = getStoredToken()
    setToken(stored)
    const delays = stored ? RETRY_MS : []

    async function attempt(index: number): Promise<void> {
      if (gen !== refreshGenRef.current)
        return

      const session = await loadSession()
      if (gen !== refreshGenRef.current)
        return

      if (session === null) {
        const delay = delays[index]
        if (delay != null) {
          await wait(delay)
          await attempt(index + 1)
          return
        }
        // 可恢复瞬断耗尽：保留 token（及已有 user）；RequireAuth 以 token||user 判定
        return
      }

      const sessionUser = session.data && session.data.user
      if (sessionUser) {
        if (gen !== refreshGenRef.current)
          return
        setUser(sessionUser)
        setToken(getStoredToken())
        return
      }

      // 服务端未就绪 / 5xx：保留 token，短等再试（pnpm dev 重启）
      if (session.error && !isUnauthorized(session.error)) {
        const delay = delays[index]
        if (delay != null) {
          await wait(delay)
          await attempt(index + 1)
          return
        }
        // 可恢复瞬断耗尽：同上，不清 token/user（RequireAuth 认 token）
        return
      }

      // 明确无会话 / 401·403：token 与 user 一起清
      if (gen !== refreshGenRef.current)
        return
      setUser(null)
      setStoredToken(null)
      setToken(null)
    }

    await attempt(0)
  }

  useEffect(() => {
    refreshSession().finally(() => setIsLoading(false))
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await authClient.signIn.email({ email, password })
    if (error)
      throw new Error(error.message ?? '登录失败')
    await refreshSession()
    setToken(getStoredToken())
  }

  async function signUp(email: string, password: string, name: string) {
    const { error } = await authClient.signUp.email({ email, password, name })
    if (error)
      throw new Error(error.message ?? '注册失败')
    await refreshSession()
    setToken(getStoredToken())
  }

  async function signOut() {
    refreshGenRef.current += 1
    await authClient.signOut()
    setStoredToken(null)
    setToken(null)
    setUser(null)
  }

  const value: AuthContextValue = {
    user,
    token,
    isLoading,
    signIn,
    signUp,
    signOut,
  }

  return (
    <AuthContext value={value}>
      {children}
    </AuthContext>
  )
}
