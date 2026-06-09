import process from 'node:process'
import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins'
import { authDb } from '../db/sqlite'

function createAuth() {
  return betterAuth({
    database: authDb() as never,
    emailAndPassword: { enabled: true },
    plugins: [bearer()],
    baseURL: process.env.BETTER_AUTH_URL ?? 'https://localhost:3000',
    secret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-change-me-in-production',
    trustedOrigins: [
      'https://localhost:5173',
      'http://localhost:5173',
      'https://localhost:3000',
    ],
  })
}

type Auth = ReturnType<typeof createAuth>

let authSingleton: Auth | undefined

export function getAuth(): Auth {
  if (!authSingleton)
    authSingleton = createAuth()
  return authSingleton
}
