import { sql } from 'drizzle-orm'
import { bigint, check, index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

// ───────────────────────────── gtd_rows ─────────────────────────────
// 服务端权威当前行。无事务链 / 墓碑 / 设备时钟。

/** 每用户当前 GTD 实体行（task / task_tag / perspective / attachment）。 */
export const gtdRows = pgTable('gtd_rows', {
  userId: text('user_id').notNull(),
  entity: text('entity').notNull(),
  id: text('id').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  syncId: bigint('sync_id', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.userId, table.entity, table.id] }),
  index('idx_gtd_rows_task_mount').on(table.userId, sql`(${table.data}->>'mountDirId')`).where(sql`entity = 'task'`),
  index('idx_gtd_rows_task_tag').on(table.userId, sql`(${table.data}->>'tagId')`).where(sql`entity = 'task_tag'`),
  check('ck_gtd_rows_entity', sql`entity IN ('task', 'task_tag', 'perspective', 'attachment')`),
])
