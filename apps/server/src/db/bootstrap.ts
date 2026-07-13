import { getMigrations } from 'better-auth/db/migration'
import { getAuth } from '../auth/auth'
import { setupCheckpointer } from './checkpointer'
import { migrateAppSchema } from './migrate'

let bootstrapped = false

export async function bootstrapDatabases(): Promise<void> {
  if (bootstrapped)
    return

  // 1. better-auth 表（user/session/account/verification）
  const { runMigrations } = await getMigrations(getAuth().options)
  await runMigrations()

  // 2. drizzle 表（conversation_threads）
  await migrateAppSchema()

  // 3. LangGraph checkpoint 表
  await setupCheckpointer()

  bootstrapped = true
  console.log('[db] postgres ready (auth + conversation_threads + checkpoints)')
}
