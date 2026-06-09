import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const conversationThreads = sqliteTable('conversation_threads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  agentId: text('agent_id').notNull(),
  title: text('title').notNull(),
  pinned: integer('pinned').notNull().default(0),
  seq: integer('seq').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [
  index('idx_conv_user_list').on(table.userId, table.pinned, table.updatedAt),
])
