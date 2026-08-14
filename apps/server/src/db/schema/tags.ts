import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * 跨域公共标签目录（KB / GTD 等）。按 userId 隔离，扁平（无 parentId）。
 * 标签目录已退出 GTD sync（对齐 dirs），改走 REST /tags；task_tag 仍走 sync。
 * 业务 list 过滤 deleted=false。
 * 未删除行唯一 (user_id, name) —— 见迁移 partial unique。
 */
export const tags = pgTable('tags', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  color: text('color'),
  deleted: boolean('deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  index('idx_tags_user_name').on(table.userId, table.name),
])

export type SharedTagRow = typeof tags.$inferSelect
