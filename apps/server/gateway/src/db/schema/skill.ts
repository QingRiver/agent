import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tags } from './tags'

/** Skill 控制面：1:1 打标 dirs.id，不出现在树上 */
export const skills = pgTable('skills', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  dirId: text('dir_id').notNull(),
  code: text('code').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  uniqueIndex('uniq_skills_dir_id').on(table.dirId),
  uniqueIndex('uniq_skills_user_code').on(table.userId, table.code),
  index('idx_skills_user').on(table.userId),
  check('ck_skills_status', sql`status IN ('usable', 'offline')`),
])

/**
 * 树上挂载的活文本（基础 kind；skill / prompt 共用）。
 * 无 FK——dir 存活由 server stamp；唯一 (user_id, mount_dir_id, filename)。
 */
export const versionTexts = pgTable('version_text', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  mountDirId: text('mount_dir_id').notNull(),
  filename: text('filename').notNull(),
  content: text('content').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  uniqueIndex('uniq_version_text_user_mount_filename').on(table.userId, table.mountDirId, table.filename),
  index('idx_version_text_user_mount').on(table.userId, table.mountDirId),
])

/** Skill ↔ 公共标签。dirs 不打标。 */
export const skillTags = pgTable('skill_tags', {
  skillId: text('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, table => [
  primaryKey({ columns: [table.skillId, table.tagId] }),
  index('idx_skill_tags_tag').on(table.tagId),
  index('idx_skill_tags_skill').on(table.skillId),
])
