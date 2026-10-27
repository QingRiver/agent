import { sql } from 'drizzle-orm'
import { bigint, check, index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

// ───────────────────────────── gtd_* ─────────────────────────────
// 事务重放同步（wiki/GTD-事务重放.md）。真相是每用户一条按 seq 编号的事务链；
// gtd_rows / gtd_tombstones / gtd_clients 是链重放到 gtd_heads.seq 时的状态（@agent/gtd ReplicaState），
// 与链在同一个数据库事务里更新。服务器不解释行内容，没有业务约束与外键：
// 环、孤儿、失效挂载、已删标签都是读时规则。

/** 每用户一行：已重放到的 seq 与压缩点。追加事务时 FOR UPDATE 作为用户锁。 */
export const gtdHeads = pgTable('gtd_heads', {
  userId: text('user_id').primaryKey(),
  seq: bigint('seq', { mode: 'number' }).notNull().default(0),
  /** seq 不大于它的事务已删除；进度更早的设备拿快照。 */
  compactedSeq: bigint('compacted_seq', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

/** 事务链：seq 每用户从 1 连续；(client_id, client_seq) 唯一。 */
export const gtdTxns = pgTable('gtd_txns', {
  userId: text('user_id').notNull(),
  seq: bigint('seq', { mode: 'number' }).notNull(),
  txnId: text('txn_id').notNull(),
  clientId: text('client_id').notNull(),
  clientSeq: bigint('client_seq', { mode: 'number' }).notNull(),
  clientTs: text('client_ts').notNull(),
  writes: jsonb('writes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.userId, table.seq] }),
  uniqueIndex('uniq_gtd_txns_user_client_seq').on(table.userId, table.clientId, table.clientSeq),
])

/** 当前状态的行。data 为该实体的行数据（列名同 @agent/gtd 行 schema）。 */
export const gtdRows = pgTable('gtd_rows', {
  userId: text('user_id').notNull(),
  entity: text('entity').notNull(),
  id: text('id').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  /** 最后一次写到这一行的事务 seq。 */
  lastSeq: bigint('last_seq', { mode: 'number' }).notNull(),
}, table => [
  primaryKey({ columns: [table.userId, table.entity, table.id] }),
  index('idx_gtd_rows_task_mount').on(table.userId, sql`(${table.data}->>'mountDirId')`).where(sql`entity = 'task'`),
  index('idx_gtd_rows_task_tag').on(table.userId, sql`(${table.data}->>'tagId')`).where(sql`entity = 'task_tag'`),
  check('ck_gtd_rows_entity', sql`entity IN ('task', 'task_tag', 'perspective', 'attachment')`),
])

/** 已永久删除的 task id：之后对它的任何写入都无效。 */
export const gtdTombstones = pgTable('gtd_tombstones', {
  userId: text('user_id').notNull(),
  taskId: text('task_id').notNull(),
}, table => [
  primaryKey({ columns: [table.userId, table.taskId] }),
])

/**
 * 每台设备已被接受的最大 clientSeq：判断重发与缺号。
 * 长期不活跃的设备在压缩时删除；它回来时会被要求从 1 重发，换新设备 id 重新编号。
 */
export const gtdClients = pgTable('gtd_clients', {
  userId: text('user_id').notNull(),
  clientId: text('client_id').notNull(),
  clientSeq: bigint('client_seq', { mode: 'number' }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.userId, table.clientId] }),
])
