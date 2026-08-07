import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { boolean, check, doublePrecision, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * 统一 dirs 树（吸收 gtd_projects/gtd_folders/kb_nodes）。在线权威表（不进 GTD 离线 sync）。
 *
 * project=根（kind='project', parent_id 恒 null，纯命名作用域，无 GTD facet 列）；
 * dir=子节点（kind='dir', 须有 parent，嵌套 ≤ MAX_DEPTH=5）。
 *
 * 结构靠 `parent_id` 链表达（**无 ltree/path 物化列**）；层级查询由 service 层
 * 「按 `project_id` 拉全树 + buildDirTree 内存组装」完成。`project_id` = walkToRoot(parent_id)
 * 派生的冗余缓存（server 维护，非 LWW）：project 根=自身 id，dir=父的 project_id；
 * 跨 project move 级联更新子树所有 dirs + 挂载实体（task/doc）的 project_id。
 * `vdir` = name 链派生（展示 + PG 关系查询，**不进 Qdrant payload**）；rename/move 均重算。
 * task/doc 经各自表的 `mount_dir_id` 列挂载到 dirs 节点。
 *
 * 自引用 FK（parent_id / project_id → dirs.id）DEFERRABLE INITIALLY DEFERRED 见迁移
 * （被引列 dirs.id PK 满足 DEFERRABLE 前置；事务内容忍拓扑临时态，提交前应用层校验）。
 * 同级名唯一 (user_id, COALESCE(parent_id,''), name) WHERE deleted=false 见迁移 partial unique。
 */
export const dirs = pgTable('dirs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  parentId: text('parent_id').references((): AnyPgColumn => dirs.id, { onDelete: 'restrict' }),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  sortOrder: doublePrecision('sort_order').notNull(),
  /** 冗余缓存 = walkToRoot(parent_id) 到 project 根；project 根=自身 id；server 维护 */
  projectId: text('project_id').notNull().references((): AnyPgColumn => dirs.id, { onDelete: 'restrict' }),
  vdir: text('vdir').notNull(),
  acl: jsonb('acl').notNull().default({}),
  ownerId: text('owner_id').notNull(),
  etag: integer('etag').notNull().default(1),
  deleted: boolean('deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, table => [
  index('idx_dirs_user_project').on(table.userId, table.projectId),
  index('idx_dirs_user_parent').on(table.userId, table.parentId),
  index('idx_dirs_user_owner').on(table.userId, table.ownerId),
  check('ck_dirs_kind', sql`kind IN ('project', 'dir')`),
  check('ck_dirs_project_root', sql`(kind = 'project' AND parent_id IS NULL) OR kind = 'dir'`),
  // 同级名唯一 (user_id, COALESCE(parent_id,''), name) WHERE deleted=false 见迁移 uniq_dirs_parent_name
  // parent_id / project_id 自引用 FK DEFERRABLE INITIALLY DEFERRED 见迁移
])

export type DirDbRow = typeof dirs.$inferSelect
