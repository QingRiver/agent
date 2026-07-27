import process from 'node:process'
import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins'
import { pool } from '../db/client'
import { DEV_TRUSTED_HOSTS } from './devOrigins'

function resolveAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (secret)
    return secret
  if (process.env.NODE_ENV === 'production')
    throw new Error('BETTER_AUTH_SECRET is required in production')
  return 'dev-secret-change-me-in-production'
}

function createAuth() {
  return betterAuth({
    database: pool as never,
    emailAndPassword: { enabled: true },
    plugins: [bearer()],
    baseURL: process.env.BETTER_AUTH_URL ?? 'https://localhost:3000',
    secret: resolveAuthSecret(),
    trustedOrigins: [...DEV_TRUSTED_HOSTS],
  })
}

type Auth = ReturnType<typeof createAuth>

let authSingleton: Auth | undefined

export function getAuth(): Auth {
  if (!authSingleton)
    authSingleton = createAuth()
  return authSingleton
}
