import { bigint, boolean, index, integer, pgTable, text } from 'drizzle-orm/pg-core'

export const conversationThreads = pgTable('conversation_threads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  agentId: text('agent_id').notNull(),
  title: text('title').notNull(),
  pinned: boolean('pinned').notNull().default(false),
  seq: integer('seq').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
}, table => [
  index('idx_conv_user_list').on(table.userId, table.pinned, table.updatedAt),
])
