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

export const conversationMessages = sqliteTable('conversation_messages', {
  threadId: text('thread_id').primaryKey(),
  messages: text('messages').notNull(),
  updatedAt: integer('updated_at').notNull(),
})
