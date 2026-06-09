import { getMigrations } from 'better-auth/db/migration'
import { getAuth } from '../auth/auth'
import { migrateConversationSchema } from './conversation-schema'
import { ensureDataDir } from './sqlite'

let bootstrapped = false

export async function bootstrapDatabases(): Promise<void> {
  if (bootstrapped)
    return

  ensureDataDir()

  const { runMigrations } = await getMigrations(getAuth().options)
  await runMigrations()

  migrateConversationSchema()

  bootstrapped = true
  console.log('[db] auth.sqlite + app.sqlite ready (checkpoints.sqlite on first use)')
}
