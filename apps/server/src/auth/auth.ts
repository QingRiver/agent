import process from 'node:process'
import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins'
import { pool } from '../db/client'
import { DEV_TRUSTED_HOSTS } from './devOrigins'

function createAuth() {
  return betterAuth({
    database: pool as never,
    emailAndPassword: { enabled: true },
    plugins: [bearer()],
    baseURL: process.env.BETTER_AUTH_URL ?? 'https://localhost:3000',
    secret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-change-me-in-production',
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
