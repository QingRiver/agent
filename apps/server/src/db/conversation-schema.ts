import { appDb } from './sqlite'

export function migrateConversationSchema(): void {
  appDb().exec(`
    CREATE TABLE IF NOT EXISTS conversation_threads (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      agent_id    TEXT NOT NULL,
      title       TEXT NOT NULL,
      pinned      INTEGER NOT NULL DEFAULT 0,
      seq         INTEGER NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conv_user_list
      ON conversation_threads(user_id, pinned DESC, updated_at DESC);

    CREATE TABLE IF NOT EXISTS conversation_messages (
      thread_id   TEXT PRIMARY KEY,
      messages    TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  `)
}
