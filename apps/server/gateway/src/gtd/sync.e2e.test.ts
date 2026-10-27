import type { ClientReplica, LocalIntent, SyncResponse } from '@agent/gtd'
import { randomUUID } from 'node:crypto'
import {
  createClientReplica,
  displayRows,
  emitWrites,
  enqueueTransaction,
  EXPLICIT_STATUS,
  fromSnapshot,
  receivePull,
  replayTransactions,
  toSnapshot,
} from '@agent/gtd'
import { eq, like } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../db/drizzle'
import { migrateAppSchema } from '../db/migrate'
import { gtdClients, gtdHeads, gtdRows, gtdTombstones, gtdTxns } from '../db/schema'
import { appendServerIntents, hasTasksMountedIn, syncGtd, tasksTaggedWith } from './txn-log'

const USER_PREFIX = 'gtd-txn-e2e-'
const NOW = '2026-07-17T09:00:00.000Z'

/** pattern 为 LIKE 模式；不含通配符时即精确匹配。 */
async function deleteUsers(pattern: string): Promise<void> {
  await db.delete(gtdTxns).where(like(gtdTxns.userId, pattern))
  await db.delete(gtdRows).where(like(gtdRows.userId, pattern))
  await db.delete(gtdTombstones).where(like(gtdTombstones.userId, pattern))
  await db.delete(gtdClients).where(like(gtdClients.userId, pattern))
  await db.delete(gtdHeads).where(like(gtdHeads.userId, pattern))
}

function newUser(): string {
  return `${USER_PREFIX}${randomUUID()}`
}

/** 一台设备：本地副本 + 和服务器往返。 */
class Device {
  local: ClientReplica
  last: SyncResponse | null = null

  constructor(readonly userId: string, clientId: string) {
    this.local = createClientReplica(userId, clientId)
  }

  async sync(): Promise<SyncResponse> {
    const res = await syncGtd(this.userId, {
      clientId: this.local.clientId,
      afterSeq: this.local.confirmed.seq,
      transactions: this.local.pending,
    })
    this.local = receivePull(this.local, res)
    this.last = res
    return res
  }

  enqueue(intents: LocalIntent[]): void {
    const writes = emitWrites(displayRows(this.local), intents, this.userId)
    this.local = enqueueTransaction(this.local, { id: randomUUID(), clientTs: NOW, writes }).local
  }

  rows() {
    return displayRows(this.local)
  }

  task(id: string) {
    const row = this.rows().find(r => r.entity === 'task' && r.id === id)
    return row?.entity === 'task' ? row : undefined
  }
}

function createTask(taskId: string, extra: { name?: string, parentId?: string | null, mountDirId?: string | null } = {}): LocalIntent {
  return {
    kind: 'command',
    command: {
      id: randomUUID(),
      type: 'create_task',
      taskId,
      name: extra.name ?? taskId,
      parentId: extra.parentId ?? null,
      order: 0,
      mountDirId: extra.mountDirId ?? null,
      clientTs: NOW,
    },
  }
}

function rename(taskId: string, name: string): LocalIntent {
  return {
    kind: 'mutation',
    mutation: { id: randomUUID(), entity: 'task', entityId: taskId, op: 'upsert', clientTs: NOW, patch: { name } },
  }
}

function tag(taskId: string, tagId: string): LocalIntent {
  return {
    kind: 'mutation',
    mutation: { id: randomUUID(), entity: 'task_tag', entityId: `${taskId}|${tagId}`, op: 'upsert', clientTs: NOW, patch: { taskId, tagId } },
  }
}

function trash(taskId: string): LocalIntent {
  return { kind: 'command', command: { id: randomUUID(), type: 'delete', taskId, clientTs: NOW } }
}

describe('gtd 事务链 Postgres 存储', () => {
  beforeAll(async () => {
    await migrateAppSchema()
    await deleteUsers(`${USER_PREFIX}%`)
  })

  afterAll(async () => {
    await deleteUsers(`${USER_PREFIX}%`)
  })

  it('一台设备写入，另一台设备拉到同样的状态', async () => {
    const userId = newUser()
    const a = new Device(userId, 'A')
    const b = new Device(userId, 'B')
    a.enqueue([createTask('t1', { name: 'buy milk' })])
    const res = await a.sync()
    expect(res.ackedClientSeq).toBe(1)
    expect(res.transactions.map(t => t.seq)).toEqual([1])
    expect(a.local.pending).toEqual([])

    await b.sync()
    expect(b.task('t1')?.data.name).toBe('buy milk')
    expect(b.rows()).toEqual(a.rows())
  })

  it('同一列后到服务器的赢；不同列都保留', async () => {
    const userId = newUser()
    const a = new Device(userId, 'A')
    const b = new Device(userId, 'B')
    a.enqueue([createTask('t1', { name: 'v0' })])
    await a.sync()
    await b.sync()

    a.enqueue([rename('t1', 'from A')])
    b.enqueue([{
      kind: 'mutation',
      mutation: { id: randomUUID(), entity: 'task', entityId: 't1', op: 'upsert', clientTs: NOW, patch: { flagged: true } },
    }])
    b.enqueue([rename('t1', 'from B')])
    await a.sync()
    await b.sync()
    await a.sync()

    expect(a.task('t1')?.data).toMatchObject({ name: 'from B', flagged: true })
    expect(a.rows()).toEqual(b.rows())
  })

  it('重发已接受的事务不重复入链；缺号时要求从缺的那一号重发', async () => {
    const userId = newUser()
    const a = new Device(userId, 'A')
    a.enqueue([createTask('t1')])
    a.enqueue([rename('t1', 'second')])
    const [first, second] = a.local.pending

    const ok = await syncGtd(userId, { clientId: 'A', afterSeq: 0, transactions: [first!] })
    expect(ok.ackedClientSeq).toBe(1)

    const again = await syncGtd(userId, { clientId: 'A', afterSeq: 1, transactions: [first!] })
    expect(again).toMatchObject({ ackedClientSeq: 1, resendFrom: null, transactions: [] })

    const gap = await syncGtd(userId, { clientId: 'A', afterSeq: 1, transactions: [{ ...second!, clientSeq: 3 }] })
    expect(gap).toMatchObject({ ackedClientSeq: 1, resendFrom: 2, transactions: [] })

    const [head] = await db.select().from(gtdHeads).where(eq(gtdHeads.userId, userId))
    expect(head?.seq).toBe(1)
  })

  it('落库的状态与重放事务链得到的状态一致（快照路径）', async () => {
    const userId = newUser()
    const a = new Device(userId, 'A')
    a.enqueue([createTask('p', { mountDirId: 'dir-1' }), createTask('c', { parentId: 'p' }), tag('c', 'tag-1')])
    a.enqueue([rename('c', 'child'), trash('p')])
    a.enqueue([{ kind: 'purge', taskId: 'p' }])
    await a.sync()

    const replayed = replayTransactions(createClientReplica(userId, 'x').confirmed, a.last!.transactions)

    const ahead = await syncGtd(userId, { clientId: 'Z', afterSeq: 1_000_000, transactions: [] })
    expect(ahead.snapshot).not.toBeNull()
    expect(ahead.snapshot).toEqual(toSnapshot(replayed))
    expect(fromSnapshot(ahead.snapshot!).tombstones.has('p')).toBe(true)

    const tombstones = await db.select().from(gtdTombstones).where(eq(gtdTombstones.userId, userId))
    expect(tombstones.map(t => t.taskId).sort()).toEqual([...replayed.tombstones].sort())
  })

  it('服务器数据被重置后，设备换成服务器快照', async () => {
    const userId = newUser()
    const a = new Device(userId, 'A')
    a.enqueue([createTask('t1')])
    await a.sync()
    await deleteUsers(userId)

    await a.sync()
    expect(a.last?.snapshot?.seq).toBe(0)
    expect(a.rows()).toEqual([])
  })

  it('服务器产生的操作作为普通事务进链', async () => {
    const userId = newUser()
    const a = new Device(userId, 'A')
    a.enqueue([createTask('t1'), tag('t1', 'tag-1'), createTask('t2')])
    await a.sync()

    expect((await tasksTaggedWith(db, userId, 'tag-1')).map(t => t.id)).toEqual(['t1'])

    await db.transaction(tx => appendServerIntents(tx, userId, () => [trash('t1')]))
    await a.sync()
    expect(a.last?.transactions.map(t => t.clientId)).toEqual(['server'])
    expect(a.task('t1')?.data.status).toBe(EXPLICIT_STATUS.DELETED)
    expect(a.task('t2')?.data.status).toBe(EXPLICIT_STATUS.ACTIVE)
  })

  it('挂载只认根任务：子任务行里的 mountDirId 不算挂载', async () => {
    const userId = newUser()
    const a = new Device(userId, 'A')
    a.enqueue([createTask('root', { mountDirId: 'dir-root' }), createTask('child', { parentId: 'root' })])
    await a.sync()

    expect(await hasTasksMountedIn(db, userId, ['dir-root'])).toBe(true)
    expect(await hasTasksMountedIn(db, userId, ['dir-other'])).toBe(false)
    expect(a.task('child')?.data.mountDirId).toBe('dir-root')
  })
})
