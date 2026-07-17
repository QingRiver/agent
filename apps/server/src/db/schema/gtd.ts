import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { boolean, check, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

// ───────────────────────────── gtd_* ─────────────────────────────
// 1:1 复刻 OmniFocus。日期列用 timestamptz（defer/due 是业务核心，高频范围查询 + date_trunc 按天分组），
// 与 kb_* 的 bigint 不同。sort_order 用 doublePrecision(float8) + fractional indexing，不加同级唯一约束
// （重排靠应用层 + invariant 兜底 + Redis 锁）。自/互引用 FK 在迁移中改 DEFERRABLE INITIALLY DEFERRED，
// saveDocument 全量 upsert 时免拓扑排序。

/** 文件夹树（项目容器）。parent_id 自引用。 */
export const gtdFolders = pgTable('gtd_folders', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  parentId: text('parent_id').references((): AnyPgColumn => gtdFolders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: doublePrecision('sort_order').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  index('idx_gtd_folders_user_parent').on(table.userId, table.parentId),
  index('idx_gtd_folders_user_sort').on(table.userId, table.sortOrder),
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
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  index('idx_gtd_tags_user_parent').on(table.userId, table.parentId),
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
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  index('idx_gtd_projects_user_folder').on(table.userId, table.folderId),
  index('idx_gtd_projects_user_status_sort').on(table.userId, table.status, table.sortOrder),
  // Review 透视：只扫待回顾项
  index('idx_gtd_projects_user_review').on(table.userId).where(sql`next_review_date IS NOT NULL`),
])

/**
 * 任务（核心，高频查询）。parent_id 自引用（action group），project_id 互引用。
 * Inbox 语义 CHECK：无 project 必无 parent（Inbox 只能是顶层叶子）；子任务继承父 project 靠应用层 + invariant。
 * repeat_rule 1:1 内联 jsonb（非独立表，少 join）。repeated_from_task_id 追溯克隆源。
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
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  index('idx_gtd_tasks_user_proj_parent_sort').on(table.userId, table.projectId, table.parentId, table.sortOrder),
  index('idx_gtd_tasks_user_status').on(table.userId, table.status),
  index('idx_gtd_tasks_user_parent').on(table.userId, table.parentId),
  // partial index：due/defer/flagged 非空过滤，跳过大量无值项
  index('idx_gtd_tasks_user_due').on(table.userId, table.dueDate).where(sql`due_date IS NOT NULL`),
  index('idx_gtd_tasks_user_defer').on(table.userId, table.deferDate).where(sql`defer_date IS NOT NULL`),
  index('idx_gtd_tasks_user_flagged').on(table.userId).where(sql`flagged = true`),
  // BRIN (user_id, created_at) 时序排序/分页见迁移 idx_gtd_tasks_user_created_brin
  // Inbox 语义：无 project 必无 parent
  check('ck_gtd_tasks_inbox', sql`((project_id IS NULL AND parent_id IS NULL) OR project_id IS NOT NULL)`),
])

/** 任务-标签多对多。复合主键 (task_id, tag_id)。 */
export const gtdTaskTags = pgTable('gtd_task_tags', {
  taskId: text('task_id').notNull().references(() => gtdTasks.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => gtdTags.id, { onDelete: 'cascade' }),
}, table => ({
  pk: primaryKey({ columns: [table.taskId, table.tagId] }),
  tagIdx: index('idx_gtd_task_tags_tag').on(table.tagId),
}))

/**
 * 透视（自定义视图）。filter_rules/sort_by 用 jsonb（结构化、可演进），group_by 用 text[]（固定枚举数组）。
 */
export const gtdPerspectives = pgTable('gtd_perspectives', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  icon: text('icon'),
  matchMode: text('match_mode').notNull(),
  filterRules: jsonb('filter_rules').notNull().default([]),
  groupBy: text('group_by').array().notNull().default([]),
  sortBy: jsonb('sort_by').notNull().default([]),
  availabilityFilter: text('availability_filter').notNull().default('available'),
  showCompleted: boolean('show_completed').notNull().default(false),
  showDropped: boolean('show_dropped').notNull().default(false),
  flaggedOnly: boolean('flagged_only'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  uniqueIndex('uniq_gtd_perspectives_user_name').on(table.userId, table.name),
])

/** 任务附件。 */
export const gtdAttachments = pgTable('gtd_attachments', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => gtdTasks.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  url: text('url').notNull(),
  filename: text('filename').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, table => [
  index('idx_gtd_attachments_task').on(table.taskId),
])
