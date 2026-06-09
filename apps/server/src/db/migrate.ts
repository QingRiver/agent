import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './drizzle'

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
)

export function migrateAppSchema(): void {
  migrate(db, { migrationsFolder })
}
