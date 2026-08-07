import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { bigint, boolean, check, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tags } from './tags'

// ───────────────────────────── gtd_* ─────────────────────────────
// 行级统一模型：EntityRow 贯通 Client/wire/PG（同形）。project/folder 已并入 dirs 表（删除
// gtd_projects/gtd_folders）；标签目录在公共 tags 表；task_tags/attachments 冗余 user_id 便于按用户 pull。
// 1:1 复刻 OmniFocus（去 project facet：type 下沉 task groupType、status 改批量 command、review/defaults/flagged/note 删）。
// 日期列 timestamptz（defer/due 业务核心）；sort_order float8 + fractional indexing。
// 自引用 FK（parent_id）在迁移中 DEFERRABLE INITIALLY DEFERRED。sync_id 每用户单调（mode:'number' <2^53）。
// task 归属：mount_dir_id 权威（FK 软引用 dirs，落库时 server 校验存活）；project_id = walkToProjectRoot(mount_dir_id)
// 派生的冗余缓存（server 维护、非 LWW，纯缓存列无 FK）。

/**
 * 任务（核心，高频查询）。parent_id 自引用（action group）。
 * 归属权威 = `mount_dir_id`（挂载到 dirs 节点；null=Inbox）；`project_id` = walkToProjectRoot(mount_dir_id)
 * 派生冗余缓存（server 落库 stamp 填充，非 LWW，无 FK）。子任务默认继承父 mount_dir_id（应用层 + invariant）。
 * Inbox 语义 CHECK：无 mount 必无 parent；有 parent 必有 mount。
 * repeat_rule 1:1 内联 jsonb（非独立表，少 join；规则随 task 走，不独立成表）。
 */
export const gtdTasks = pgTable('gtd_tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  /** 冗余缓存 = walkToProjectRoot(mount_dir_id)；server 维护、非 LWW；纯缓存列无 FK */
  projectId: text('project_id'),
  /** 权威挂载列 → dirs.id；null=Inbox。无 FK（dir 存活由 server stamp 校验修正，避免跨事务 FK 死锁） */
  mountDirId: text('mount_dir_id'),
  parentId: text('parent_id').references((): AnyPgColumn => gtdTasks.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  note: text('note'),
  sortOrder: doublePrecision('sort_order').notNull(),
  status: text('status').notNull().default('active'),
  groupType: text('group_type'),
  deferDate: timestamp('defer_date', { withTimezone: true, mode: 'date' }),
  dueDate: timestamp('due_date', { withTimezone: true, mode: 'date' }),
  plannedMode: text('planned_mode').notNull().default('none'),
  plannedDate: timestamp('planned_date', { withTimezone: true, mode: 'date' }),
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
  index('idx_gtd_tasks_user_mount').on(table.userId, table.mountDirId),
  index('idx_gtd_tasks_user_status').on(table.userId, table.status),
  index('idx_gtd_tasks_user_parent').on(table.userId, table.parentId),
  index('idx_gtd_tasks_user_due').on(table.userId, table.dueDate).where(sql`due_date IS NOT NULL`),
  index('idx_gtd_tasks_user_defer').on(table.userId, table.deferDate).where(sql`defer_date IS NOT NULL`),
  index('idx_gtd_tasks_user_flagged').on(table.userId).where(sql`flagged = true`),
  index('idx_gtd_tasks_user_syncid').on(table.userId, table.syncId),
  // BRIN (user_id, created_at) 时序排序/分页见迁移 idx_gtd_tasks_user_created_brin
  // parent_id 自引用 FK DEFERRABLE INITIALLY DEFERRED 见迁移
  check('ck_gtd_tasks_inbox', sql`((mount_dir_id IS NULL AND parent_id IS NULL) OR mount_dir_id IS NOT NULL)`),
])

/** 任务-标签多对多。tag_id → 公共 tags；冗余 user_id 便于按用户 pull；自有 sync_id/deleted。 */
export const gtdTaskTags = pgTable('gtd_task_tags', {
  taskId: text('task_id').notNull().references(() => gtdTasks.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
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
export type TagRow = typeof tags.$inferSelect
export type PerspectiveRow = typeof gtdPerspectives.$inferSelect
export type AttachmentRow = typeof gtdAttachments.$inferSelect
