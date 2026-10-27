/**
 * GTD 事务链的 Postgres 存储（wiki/GTD-事务重放.md）。
 *
 * 服务器只做三件事：按设备 clientSeq 去重与查缺号、分配连续 seq、把事务重放进当前状态。
 * 重放用 @agent/gtd 的 appendToHead，与设备上是同一份代码；这里只负责装载与写回 ReplicaState。
 * 同一用户的所有写入在一个数据库事务里、以 gtd_heads 行锁串行。
 */
import type {
  EntityRow,
  LocalIntent,
  ReplicaRow,
  ReplicaState,
  StoredTransaction,
  SyncEntity,
  SyncRequest,
  SyncResponse,
  Transaction,
  Write,
} from '@agent/gtd'
import { randomUUID } from 'node:crypto'
import { appendToHead, emitWrites, materialize, needsSnapshot, rowKey, toSnapshot } from '@agent/gtd'
import { and, asc, eq, gt, inArray, lt, lte, ne, sql } from 'drizzle-orm'
import { db } from '../db/drizzle'
import { gtdClients, gtdHeads, gtdRows, gtdTombstones, gtdTxns } from '../db/schema'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type DbOrTx = typeof db | Tx

/** 服务器自己产生的写入（如删除标签目录）记在这个设备 id 下。 */
export const SERVER_CLIENT_ID = 'server'

/** 链上至少保留这么多条事务；超过两倍时压缩到这个数。落后更多的设备拿快照。 */
const KEEP_TRANSACTIONS = 1000

/** 压缩时删除这么久没同步过的设备记录，免得 clientSeqs 随设备 id 无限增长。 */
const CLIENT_IDLE_MS = 90 * 24 * 60 * 60 * 1000

const INSERT_CHUNK = 500

interface Head {
  seq: number
  compactedSeq: number
}

async function lockHead(tx: Tx, userId: string): Promise<Head> {
  await tx.insert(gtdHeads).values({ userId }).onConflictDoNothing()
  const [head] = await tx
    .select({ seq: gtdHeads.seq, compactedSeq: gtdHeads.compactedSeq })
    .from(gtdHeads)
    .where(eq(gtdHeads.userId, userId))
    .for('update')
  return head!
}

async function loadState(tx: Tx, userId: string, seq: number): Promise<ReplicaState> {
  const rows = await tx.select().from(gtdRows).where(eq(gtdRows.userId, userId))
  const tombstones = await tx.select({ taskId: gtdTombstones.taskId }).from(gtdTombstones).where(eq(gtdTombstones.userId, userId))
  const clients = await tx
    .select({ clientId: gtdClients.clientId, clientSeq: gtdClients.clientSeq })
    .from(gtdClients)
    .where(eq(gtdClients.userId, userId))
  const map = new Map<string, ReplicaRow>()
  for (const r of rows) {
    const entity = r.entity as SyncEntity
    map.set(rowKey(entity, r.id), { entity, id: r.id, data: r.data, lastSeq: r.lastSeq })
  }
  return {
    userId,
    seq,
    rows: map,
    tombstones: new Set(tombstones.map(t => t.taskId)),
    clientSeqs: new Map(clients.map(c => [c.clientId, c.clientSeq])),
  }
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += INSERT_CHUNK)
    out.push(items.slice(i, i + INSERT_CHUNK))
  return out
}

/** 把 before → after 的差异写回。applyTransaction 只替换被改到的行对象，按引用比较即可。 */
async function persistState(tx: Tx, before: ReplicaState, after: ReplicaState, accepted: StoredTransaction[]): Promise<void> {
  const userId = after.userId

  for (const part of chunks(accepted)) {
    await tx.insert(gtdTxns).values(part.map(t => ({
      userId,
      seq: t.seq,
      txnId: t.id,
      clientId: t.clientId,
      clientSeq: t.clientSeq,
      clientTs: t.clientTs,
      writes: t.writes,
    })))
  }

  const changed = [...after.rows.entries()]
    .filter(([key, row]) => before.rows.get(key) !== row)
    .map(([, row]) => row)
  for (const part of chunks(changed)) {
    await tx.insert(gtdRows)
      .values(part.map(r => ({ userId, entity: r.entity, id: r.id, data: r.data, lastSeq: r.lastSeq })))
      .onConflictDoUpdate({
        target: [gtdRows.userId, gtdRows.entity, gtdRows.id],
        set: { data: sql`excluded.data`, lastSeq: sql`excluded.last_seq` },
      })
  }

  const removed = new Map<SyncEntity, string[]>()
  for (const [key, row] of before.rows) {
    if (!after.rows.has(key))
      removed.set(row.entity, [...(removed.get(row.entity) ?? []), row.id])
  }
  for (const [entity, ids] of removed) {
    for (const part of chunks(ids))
      await tx.delete(gtdRows).where(and(eq(gtdRows.userId, userId), eq(gtdRows.entity, entity), inArray(gtdRows.id, part)))
  }

  const tombstones = [...after.tombstones].filter(id => !before.tombstones.has(id))
  for (const part of chunks(tombstones))
    await tx.insert(gtdTombstones).values(part.map(taskId => ({ userId, taskId }))).onConflictDoNothing()

  const clients = [...after.clientSeqs].filter(([id, seq]) => before.clientSeqs.get(id) !== seq)
  for (const [clientId, clientSeq] of clients) {
    await tx.insert(gtdClients)
      .values({ userId, clientId, clientSeq })
      .onConflictDoUpdate({ target: [gtdClients.userId, gtdClients.clientId], set: { clientSeq, lastSeenAt: new Date() } })
  }

  await tx.update(gtdHeads).set({ seq: after.seq, updatedAt: new Date() }).where(eq(gtdHeads.userId, userId))
}

async function append(tx: Tx, userId: string, head: Head, batch: Transaction[]) {
  const before = await loadState(tx, userId, head.seq)
  const result = appendToHead(before, batch)
  if (result.accepted.length > 0)
    await persistState(tx, before, result.head, result.accepted)
  return result
}

async function compact(tx: Tx, userId: string, head: Head): Promise<Head> {
  if (head.seq - head.compactedSeq <= KEEP_TRANSACTIONS * 2)
    return head
  const compactedSeq = head.seq - KEEP_TRANSACTIONS
  await tx.delete(gtdTxns).where(and(eq(gtdTxns.userId, userId), lte(gtdTxns.seq, compactedSeq)))
  await tx.update(gtdHeads).set({ compactedSeq }).where(eq(gtdHeads.userId, userId))
  await tx.delete(gtdClients).where(and(
    eq(gtdClients.userId, userId),
    ne(gtdClients.clientId, SERVER_CLIENT_ID),
    lt(gtdClients.lastSeenAt, new Date(Date.now() - CLIENT_IDLE_MS)),
  ))
  return { ...head, compactedSeq }
}

/** 记下设备这次同步的时间，返回它已被接受的最大 clientSeq。 */
async function touchClient(tx: Tx, userId: string, clientId: string): Promise<number> {
  const [row] = await tx
    .update(gtdClients)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(gtdClients.userId, userId), eq(gtdClients.clientId, clientId)))
    .returning({ clientSeq: gtdClients.clientSeq })
  return row?.clientSeq ?? 0
}

/** 一次往返：先追加设备带来的事务，再返回它还没见过的部分（含自己刚被接受的事务）。 */
export async function syncGtd(userId: string, req: SyncRequest): Promise<SyncResponse> {
  return db.transaction(async (tx) => {
    let head = await lockHead(tx, userId)
    let resendFrom: number | null = null
    let state: ReplicaState | null = null

    if (req.transactions.length > 0) {
      const result = await append(tx, userId, head, req.transactions)
      state = result.head
      head = { ...head, seq: result.head.seq }
      resendFrom = result.resendFrom
    }
    const ackedSeq = await touchClient(tx, userId, req.clientId)

    head = await compact(tx, userId, head)

    if (needsSnapshot(req.afterSeq, head, head.compactedSeq)) {
      state ??= await loadState(tx, userId, head.seq)
      return { ackedClientSeq: ackedSeq, resendFrom, snapshot: toSnapshot(state), transactions: [] }
    }

    const txns = await tx
      .select()
      .from(gtdTxns)
      .where(and(eq(gtdTxns.userId, userId), gt(gtdTxns.seq, req.afterSeq)))
      .orderBy(asc(gtdTxns.seq))
    return {
      ackedClientSeq: ackedSeq,
      resendFrom,
      snapshot: null,
      transactions: txns.map(t => ({
        id: t.txnId,
        clientId: t.clientId,
        clientSeq: t.clientSeq,
        clientTs: t.clientTs,
        seq: t.seq,
        writes: t.writes as Write[],
      })),
    }
  })
}

/**
 * 服务器自己产生的操作（删除标签时解绑、把关联任务移进回收站等）在加锁后的当前状态上生成写入，
 * 作为一条普通事务进链，设备下次同步时与其他事务一样重放。
 */
export async function appendServerIntents(
  tx: Tx,
  userId: string,
  build: (rows: EntityRow[]) => LocalIntent[],
): Promise<void> {
  const head = await lockHead(tx, userId)
  const state = await loadState(tx, userId, head.seq)
  const rows = materialize(state)
  const intents = build(rows)
  if (intents.length === 0)
    return
  const writes = emitWrites(rows, intents, userId)
  if (writes.length === 0)
    return
  const txn: Transaction = {
    id: randomUUID(),
    clientId: SERVER_CLIENT_ID,
    clientSeq: (state.clientSeqs.get(SERVER_CLIENT_ID) ?? 0) + 1,
    clientTs: new Date().toISOString(),
    writes,
  }
  const result = appendToHead(state, [txn])
  await persistState(tx, state, result.head, result.accepted)
}

// ---------------- 其他服务对当前状态的查询 ----------------

const taskRow = eq(gtdRows.entity, 'task')
const mountDirIdOf = sql<string | null>`${gtdRows.data}->>'mountDirId'`

/**
 * 是否有任务挂在这些目录上。挂载按读时规则取自根任务（没有父任务或父任务不存在），
 * 子任务行里的 mountDirId 不算数。
 */
export async function hasTasksMountedIn(client: DbOrTx, userId: string, dirIds: string[]): Promise<boolean> {
  if (dirIds.length === 0)
    return false
  const [row] = await client
    .select({ id: gtdRows.id })
    .from(gtdRows)
    .where(and(
      eq(gtdRows.userId, userId),
      taskRow,
      inArray(mountDirIdOf, dirIds),
      sql`(${gtdRows.data}->>'parentId' IS NULL OR NOT EXISTS (
        SELECT 1 FROM gtd_rows p
        WHERE p.user_id = ${gtdRows.userId} AND p.entity = 'task' AND p.id = ${gtdRows.data}->>'parentId'
      ))`,
    ))
    .limit(1)
  return !!row
}

/** 打了这个标签、且任务仍存在（含回收站里的）的任务。 */
export async function tasksTaggedWith(client: DbOrTx, userId: string, tagId: string): Promise<{ id: string, name: string, status: string }[]> {
  const links = await client
    .select({ taskId: sql<string>`${gtdRows.data}->>'taskId'` })
    .from(gtdRows)
    .where(and(
      eq(gtdRows.userId, userId),
      eq(gtdRows.entity, 'task_tag'),
      eq(sql`${gtdRows.data}->>'tagId'`, tagId),
    ))
  const taskIds = [...new Set(links.map(l => l.taskId))]
  if (taskIds.length === 0)
    return []
  const tasks = await client
    .select({ id: gtdRows.id, name: sql<string>`${gtdRows.data}->>'name'`, status: sql<string>`${gtdRows.data}->>'status'` })
    .from(gtdRows)
    .where(and(eq(gtdRows.userId, userId), taskRow, inArray(gtdRows.id, taskIds)))
  return tasks
}
