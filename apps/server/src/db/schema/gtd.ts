import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { bigint, boolean, check, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

// ───────────────────────────── gtd_* ─────────────────────────────
// 行级统一模型：EntityRow 贯通 Client/wire/PG（同形）。七表加 sync_id/deleted；
// task_tags/attachments 冗余 user_id 便于按用户 pull；clock/幂等表辅助。
// 1:1 复刻 OmniFocus。日期列 timestamptz（defer/due 业务核心）；sort_order float8 + fractional indexing。
// 自/互引用 FK 在迁移中 DEFERRABLE INITIALLY DEFERRED。sync_id 每用户单调（mode:'number' <2^53）。

/** 文件夹树（项目容器）。parent_id 自引用。 */
export const gtdFolders = pgTable('gtd_folders', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  parentId: text('parent_id').references((): AnyPgColumn => gtdFolders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: doublePrecision('sort_order').notNull(),
  status: text('status').notNull().default('active'),
  syncId: bigint('sync_id', { mode: 'number' }),
  deleted: boolean('deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  index('idx_gtd_folders_user_parent').on(table.userId, table.parentId),
  index('idx_gtd_folders_user_sort').on(table.userId, table.sortOrder),
  index('idx_gtd_folders_user_syncid').on(table.userId, table.syncId),
  // 同级不重名 (user_id, COALESCE(parent_id,''), name) 见迁移 uniq_gtd_folders_parent_name
  // parent_id 自引用 FK DEFERRABLE INITIALLY DEFERRED 见迁移
])

/** 标签树（支持层级）。parent_id 自引用。 */
export const gtdTags = pgTable('gtd_tags', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  parentId: text('parent_id').references((): AnyPgColumn => gtdTags.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color'),
  sortOrder: doublePrecision('sort_order').notNull(),
  syncId: bigint('sync_id', { mode: 'number' }),
  deleted: boolean('deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  index('idx_gtd_tags_user_parent').on(table.userId, table.parentId),
  index('idx_gtd_tags_user_syncid').on(table.userId, table.syncId),
  // 同级不重名 (user_id, COALESCE(parent_id,''), name) 见迁移 uniq_gtd_tags_parent_name
])

/**
 * 项目（sequential/parallel/singleAction）。review jsonb 1:1 整体存，
 * next_review_date 为普通列（mapper 单点双写 review jsonb + 此列；
 * generated column 对 timestamptz 不可行：text::timestamptz not immutable）。
 */
export const gtdProjects = pgTable('gtd_projects', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  folderId: text('folder_id').references(() => gtdFolders.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  note: text('note'),
  sortOrder: doublePrecision('sort_order').notNull(),
  status: text('status').notNull().default('active'),
  type: text('type').notNull(),
  defaultDeferOffset: integer('default_defer_offset'),
  defaultDueOffset: integer('default_due_offset'),
  defaultTagIds: text('default_tag_ids').array(),
  flagged: boolean('flagged').notNull().default(false),
  review: jsonb('review').notNull().default({}),
  nextReviewDate: timestamp('next_review_date', { withTimezone: true, mode: 'date' }),
  syncId: bigint('sync_id', { mode: 'number' }),
  deleted: boolean('deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  index('idx_gtd_projects_user_folder').on(table.userId, table.folderId),
  index('idx_gtd_projects_user_status_sort').on(table.userId, table.status, table.sortOrder),
  index('idx_gtd_projects_user_review').on(table.userId).where(sql`next_review_date IS NOT NULL`),
  index('idx_gtd_projects_user_syncid').on(table.userId, table.syncId),
])

/**
 * 任务（核心，高频查询）。parent_id 自引用（action group），project_id 互引用。
 * Inbox 语义 CHECK：无 project 必无 parent；子任务继承父 project 靠应用层 + invariant。
 * repeat_rule 1:1 内联 jsonb（非独立表，少 join；规则随 task 走，不独立成表）。
 */
export const gtdTasks = pgTable('gtd_tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  projectId: text('project_id').references(() => gtdProjects.id, { onDelete: 'cascade' }),
  parentId: text('parent_id').references((): AnyPgColumn => gtdTasks.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  note: text('note'),
  sortOrder: doublePrecision('sort_order').notNull(),
  status: text('status').notNull().default('active'),
  groupType: text('group_type'),
  deferDate: timestamp('defer_date', { withTimezone: true, mode: 'date' }),
  dueDate: timestamp('due_date', { withTimezone: true, mode: 'date' }),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  droppedAt: timestamp('dropped_at', { withTimezone: true, mode: 'date' }),
  flagged: boolean('flagged').notNull().default(false),
  estimateMinutes: integer('estimate_minutes'),
  repeatRule: jsonb('repeat_rule'),
  repeatedFromTaskId: text('repeated_from_task_id'),
  syncId: bigint('sync_id', { mode: 'number' }),
  deleted: boolean('deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  index('idx_gtd_tasks_user_proj_parent_sort').on(table.userId, table.projectId, table.parentId, table.sortOrder),
  index('idx_gtd_tasks_user_status').on(table.userId, table.status),
  index('idx_gtd_tasks_user_parent').on(table.userId, table.parentId),
  index('idx_gtd_tasks_user_due').on(table.userId, table.dueDate).where(sql`due_date IS NOT NULL`),
  index('idx_gtd_tasks_user_defer').on(table.userId, table.deferDate).where(sql`defer_date IS NOT NULL`),
  index('idx_gtd_tasks_user_flagged').on(table.userId).where(sql`flagged = true`),
  index('idx_gtd_tasks_user_syncid').on(table.userId, table.syncId),
  // BRIN (user_id, created_at) 时序排序/分页见迁移 idx_gtd_tasks_user_created_brin
  check('ck_gtd_tasks_inbox', sql`((project_id IS NULL AND parent_id IS NULL) OR project_id IS NOT NULL)`),
])

/** 任务-标签多对多。复合主键 (task_id, tag_id)；冗余 user_id 便于按用户 pull；自有 sync_id/deleted。 */
export const gtdTaskTags = pgTable('gtd_task_tags', {
  taskId: text('task_id').notNull().references(() => gtdTasks.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => gtdTags.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  syncId: bigint('sync_id', { mode: 'number' }),
  deleted: boolean('deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, table => ({
  pk: primaryKey({ columns: [table.taskId, table.tagId] }),
  tagIdx: index('idx_gtd_task_tags_tag').on(table.tagId),
  userSyncIdx: index('idx_gtd_task_tags_user_syncid').on(table.userId, table.syncId),
}))

/**
 * 透视（自定义视图）。filter/sort_by 用 jsonb（结构化、可演进），group_by 用 text[]。
 * filter 为可嵌套 JSON DSL 树；null=无过滤。
 */
export const gtdPerspectives = pgTable('gtd_perspectives', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  icon: text('icon'),
  filter: jsonb('filter'),
  groupBy: text('group_by').array().notNull().default([]),
  sortBy: jsonb('sort_by').notNull().default([]),
  availabilityFilter: text('availability_filter').notNull().default('available'),
  showCompleted: boolean('show_completed').notNull().default(false),
  showDropped: boolean('show_dropped').notNull().default(false),
  flaggedOnly: boolean('flagged_only'),
  syncId: bigint('sync_id', { mode: 'number' }),
  deleted: boolean('deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  uniqueIndex('uniq_gtd_perspectives_user_name').on(table.userId, table.name),
  index('idx_gtd_perspectives_user_syncid').on(table.userId, table.syncId),
])

/** 任务附件。冗余 user_id 便于按用户 pull。 */
export const gtdAttachments = pgTable('gtd_attachments', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => gtdTasks.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  kind: text('kind').notNull(),
  url: text('url').notNull(),
  filename: text('filename').notNull(),
  syncId: bigint('sync_id', { mode: 'number' }),
  deleted: boolean('deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, table => [
  index('idx_gtd_attachments_task').on(table.taskId),
  index('idx_gtd_attachments_user_syncid').on(table.userId, table.syncId),
])

// ───────────────────────────── sync 辅助表（非 EntityRow） ─────────────────────────────

/** 每用户单调 clock（权威分配源）；push 事务内 FOR UPDATE 锁此行分配下一 syncId。 */
export const gtdSyncClocks = pgTable('gtd_sync_clocks', {
  userId: text('user_id').primaryKey(),
  clock: bigint('clock', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

/**
 * mutation/command.id 幂等持久化；rejected 也记录避免死重试。
 * status: 'applied' | 'rejected'；applied 时 syncId 记分配值，rejected 时 NULL。
 */
export const gtdSyncMutations = pgTable('gtd_sync_mutations', {
  userId: text('user_id').notNull(),
  mutationId: text('mutation_id').notNull(),
  syncId: bigint('sync_id', { mode: 'number' }),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, table => ({
  pk: primaryKey({ columns: [table.userId, table.mutationId] }),
}))

// ───────────────────────────── DB row 类型（drizzle inferSelect） ─────────────────────────────
export type TaskRow = typeof gtdTasks.$inferSelect
export type FolderRow = typeof gtdFolders.$inferSelect
export type ProjectRow = typeof gtdProjects.$inferSelect
export type TagRow = typeof gtdTags.$inferSelect
export type PerspectiveRow = typeof gtdPerspectives.$inferSelect
export type AttachmentRow = typeof gtdAttachments.$inferSelect
