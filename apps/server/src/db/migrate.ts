import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './drizzle'
import { appDb } from './sqlite'

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
)

interface MigrationJournal {
  entries: Array<{
    tag: string
    when: number
  }>
}

/** 从手写 SQL 迁移到 drizzle-kit 时，已有表则只登记 journal，不重复建表 */
function baselineLegacyConversationSchema(): void {
  const sqlite = appDb()
  const legacyTables = sqlite.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name IN ('conversation_threads', 'conversation_messages')
  `).all() as Array<{ name: string }>
  if (legacyTables.length === 0)
    return

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    )
  `)

  const applied = sqlite.prepare('SELECT id FROM __drizzle_migrations LIMIT 1').get()
  if (applied)
    return

  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
  ) as MigrationJournal

  for (const entry of journal.entries) {
    const sqlContent = fs.readFileSync(
      path.join(migrationsFolder, `${entry.tag}.sql`),
      'utf8',
    )
    const hash = createHash('sha256').update(sqlContent).digest('hex')
    sqlite.prepare(
      'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
    ).run(hash, entry.when)
  }
}

export function migrateAppSchema(): void {
  baselineLegacyConversationSchema()
  migrate(db, { migrationsFolder })
}
