import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
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
 * 树上挂载的版本化文本（skill / prompt / config）。
 * version=0 草稿；version≥1 不可变已发布。
 * 唯一 (user_id, mount_dir_id, filename, version)；type 不参与同名共存。
 */
export const versionTexts = pgTable('version_text', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  mountDirId: text('mount_dir_id').notNull(),
  filename: text('filename').notNull(),
  /** skill | prompt | config */
  type: text('type').notNull().default('skill'),
  /** 0=草稿；≥1=已发布快照 */
  version: integer('version').notNull().default(0),
  content: text('content').notNull(),
  versionDesc: text('version_desc'),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  uniqueIndex('uniq_version_text_user_mount_filename_version').on(
    table.userId,
    table.mountDirId,
    table.filename,
    table.version,
  ),
  index('idx_version_text_user_mount').on(table.userId, table.mountDirId),
  index('idx_version_text_user_mount_filename').on(table.userId, table.mountDirId, table.filename),
  check('ck_version_text_type', sql`type IN ('skill', 'prompt', 'config')`),
  check('ck_version_text_version_nonneg', sql`version >= 0`),
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
