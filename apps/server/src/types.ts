import type { Http2Bindings } from '@hono/node-server'

export interface AuthUser {
  id: string
  email: string
  name: string
  image?: string | null | undefined
}

export interface AuthSession {
  id: string
  userId: string
  expiresAt: Date
}

/** Hono 应用环境：Node HTTP/2 绑定，供 logger / 心跳读取 ALPN 等 */
export interface AppEnv {
  Bindings: Http2Bindings
  Variables: {
    user: AuthUser | null
    session: AuthSession | null
  }
}
