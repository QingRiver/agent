import { bigint, boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * 跨域公共标签目录（KB / GTD 等）。按 userId 隔离，扁平（无 parentId）。
 * sync_id/deleted 供 GTD incremental sync 与 tombstone；业务 list 过滤 deleted=false。
 * 未删除行唯一 (user_id, name) —— 见迁移 partial unique。
 */
export const tags = pgTable('tags', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  color: text('color'),
  syncId: bigint('sync_id', { mode: 'number' }),
  deleted: boolean('deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  index('idx_tags_user_syncid').on(table.userId, table.syncId),
  index('idx_tags_user_name').on(table.userId, table.name),
])

export type SharedTagRow = typeof tags.$inferSelect
