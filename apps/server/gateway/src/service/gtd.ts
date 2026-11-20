/**
 * GTD 服务端权威存储：当前行在 gtd_rows；写入走 applyIntents（与客户端同一套状态机）。
 */
import type { ApplyRequest, EntityRow, GtdEntity, GtdIntent } from '@agent/gtd'
import { applyIntents, EntityRowSchema } from '@agent/gtd'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/drizzle'
import { gtdRows } from '../db/schema'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type DbOrTx = typeof db | Tx

const INSERT_CHUNK = 500

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += INSERT_CHUNK)
    out.push(items.slice(i, i + INSERT_CHUNK))
  return out
}

function rowKey(entity: string, id: string): string {
  return `${entity}:${id}`
}

async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), 0)`)
}

function toEntityRows(userId: string, raw: { entity: string, id: string, data: Record<string, unknown>, syncId: number }[]): EntityRow[] {
  return raw.map((r) => {
    const row = {
      entity: r.entity,
      id: r.id,
      userId,
      syncId: r.syncId,
      deleted: false,
      data: r.data,
    }
    return EntityRowSchema.parse(row)
  })
}

async function loadRows(client: DbOrTx, userId: string): Promise<EntityRow[]> {
  const raw = await client
    .select({
      entity: gtdRows.entity,
      id: gtdRows.id,
      data: gtdRows.data,
      syncId: gtdRows.syncId,
    })
    .from(gtdRows)
    .where(eq(gtdRows.userId, userId))
  return toEntityRows(userId, raw)
}

async function persistRows(tx: Tx, userId: string, before: EntityRow[], after: EntityRow[]): Promise<void> {
  const beforeKeys = new Map(before.map(r => [rowKey(r.entity, r.id), r]))
  const afterKeys = new Map(after.map(r => [rowKey(r.entity, r.id), r]))
  const now = new Date()

  const upserts = after.filter((r) => {
    const prev = beforeKeys.get(rowKey(r.entity, r.id))
    return !prev || prev.syncId !== r.syncId || JSON.stringify(prev.data) !== JSON.stringify(r.data)
  })
  for (const part of chunks(upserts)) {
    await tx.insert(gtdRows)
      .values(part.map(r => ({
        userId,
        entity: r.entity,
        id: r.id,
        data: r.data as Record<string, unknown>,
        syncId: r.syncId,
        updatedAt: now,
      })))
      .onConflictDoUpdate({
        target: [gtdRows.userId, gtdRows.entity, gtdRows.id],
        set: {
          data: sql`excluded.data`,
          syncId: sql`excluded.sync_id`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
  }

  const removed = new Map<GtdEntity, string[]>()
  for (const [key, row] of beforeKeys) {
    if (!afterKeys.has(key))
      removed.set(row.entity, [...(removed.get(row.entity) ?? []), row.id])
  }
  for (const [entity, ids] of removed) {
    for (const part of chunks(ids))
      await tx.delete(gtdRows).where(and(eq(gtdRows.userId, userId), eq(gtdRows.entity, entity), inArray(gtdRows.id, part)))
  }
}

export async function listGtd(userId: string): Promise<{ rows: EntityRow[] }> {
  return { rows: await loadRows(db, userId) }
}

export async function applyGtd(userId: string, req: ApplyRequest): Promise<{ rows: EntityRow[] }> {
  try {
    return await db.transaction(async (tx) => {
      await lockUser(tx, userId)
      const before = await loadRows(tx, userId)
      const after = applyIntents(before, req.intents, userId)
      await persistRows(tx, userId, before, after)
      return { rows: after }
    })
  }
  catch (err) {
    if (err instanceof HTTPException)
      throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new HTTPException(400, { message })
  }
}

/**
 * 在已有数据库事务里执行意图（如删除标签时解绑）。调用方负责外层事务；
 * 本函数会再加用户 advisory 锁（与外层同事务）。
 */
export async function applyGtdIntents(
  tx: Tx,
  userId: string,
  build: (rows: EntityRow[]) => GtdIntent[],
): Promise<EntityRow[]> {
  await lockUser(tx, userId)
  const before = await loadRows(tx, userId)
  const intents = build(before)
  if (intents.length === 0)
    return before
  const after = applyIntents(before, intents, userId)
  await persistRows(tx, userId, before, after)
  return after
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
