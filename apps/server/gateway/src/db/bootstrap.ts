import { getMigrations } from 'better-auth/db/migration'
import { getAuth } from '../auth/auth'
import { setupCheckpointer } from './checkpointer'
import { migrateAppSchema } from './migrate'

let bootstrapPromise: Promise<void> | undefined

async function runDatabaseBootstrap(): Promise<void> {
  // 1. better-auth 表（user/session/account/verification）
  const { runMigrations } = await getMigrations(getAuth().options)
  await runMigrations()

  // 2. drizzle 表（conversation / kb / gtd / tags）
  await migrateAppSchema()

  // 3. LangGraph checkpoint 表
  await setupCheckpointer()

  console.log('[db] postgres ready (auth + drizzle + checkpoints)')
}

export function bootstrapDatabases(): Promise<void> {
  if (bootstrapPromise)
    return bootstrapPromise

  bootstrapPromise = runDatabaseBootstrap()

  return bootstrapPromise
}
