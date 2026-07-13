import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db } from './drizzle'

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
)

/** 应用 drizzle 迁移（postgres 方言），创建/更新 conversation_threads */
export async function migrateAppSchema(): Promise<void> {
  await migrate(db, { migrationsFolder })
}
