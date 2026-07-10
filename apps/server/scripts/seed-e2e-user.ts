import process from 'node:process'
import { getAuth } from '../src/auth/auth'
import { bootstrapDatabases } from '../src/db/bootstrap'

/** Agent / CI 用的固定 E2E 账号（写入 auth.sqlite，密码经 better-auth 哈希） */
export const E2E_USER = {
  email: 'agent-e2e@cursor.local',
  password: 'agent-e2e-pass',
  name: 'Cursor Agent',
} as const

async function main() {
  await bootstrapDatabases()
  const auth = getAuth()

  const signIn = () => auth.api.signInEmail({
    body: { email: E2E_USER.email, password: E2E_USER.password },
  })

  try {
    const created = await auth.api.signUpEmail({
      body: E2E_USER,
    })
    console.log('[devops/e2e/auth] created user', created.user.id, created.user.email)
    if ('token' in created && created.token)
      console.log('[devops/e2e/auth] bearer token (dev only):', created.token)
    return
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.toLowerCase().includes('exist') && !message.toLowerCase().includes('already'))
      throw error
  }

  const signedIn = await signIn()
  console.log('[devops/e2e/auth] user already exists:', signedIn.user.id, signedIn.user.email)
  if ('token' in signedIn && signedIn.token)
    console.log('[devops/e2e/auth] bearer token (dev only):', signedIn.token)
}

main().catch((error: unknown) => {
  console.error('[devops/e2e/auth] failed:', error)
  process.exit(1)
})
