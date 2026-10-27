/**
 * 多设备收敛：随机离线操作、随机同步顺序、随机压缩后，所有设备与服务器的状态完全一致，
 * 且读路径（建树、有效状态）在任意交错下都能终止。
 */
import type { EntityRow, EntityRowOf } from '../data/sync-schema'
import type { LocalIntent } from './emit'
import type { ClientReplica } from './local'
import type { ServerLog } from './log'
import { describe, expect, it } from 'vitest'
import { repeatSuccessorId } from '../command/repeat'
import { EXPLICIT_STATUS } from '../data/types'
import { createOf, makeCommand, makeMutation, makeRepeatRule, makeTaskRow, SYNC_NOW } from '../fixtures'
import { effectiveStatus } from '../inheritance/effective'
import { buildTaskTree } from '../structure/tree'
import { emitWrites } from './emit'
import { createClientReplica, displayRows, enqueueTransaction, receivePull } from './local'
import { appendTransactions, compactLog, createServerLog, pullSince } from './log'
import { materialize } from './replica'
import { toSnapshot } from './snapshot'

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class World {
  server: ServerLog = createServerLog('u1')
  devices: ClientReplica[]
  private txnCounter = 0

  constructor(clientIds: string[]) {
    this.devices = clientIds.map(id => createClientReplica('u1', id))
  }

  /** 在设备 i 上执行一次本地操作；非法操作返回 false。 */
  act(i: number, intent: LocalIntent): boolean {
    const device = this.devices[i]!
    let writes
    try {
      writes = emitWrites(displayRows(device), intent, 'u1')
    }
    catch {
      return false
    }
    if (writes.length === 0)
      return false
    this.devices[i] = enqueueTransaction(device, { id: `txn-${++this.txnCounter}`, clientTs: SYNC_NOW, writes }).local
    return true
  }

  seed(i: number, rows: EntityRow[]): void {
    const device = this.devices[i]!
    this.devices[i] = enqueueTransaction(device, { id: `txn-${++this.txnCounter}`, clientTs: SYNC_NOW, writes: rows.map(createOf) }).local
  }

  sync(i: number): void {
    const device = this.devices[i]!
    if (device.pending.length > 0)
      this.server = appendTransactions(this.server, device.pending).log
    this.devices[i] = receivePull(device, pullSince(this.server, device.confirmed.seq))
  }

  compact(): void {
    this.server = compactLog(this.server)
  }

  syncAll(): void {
    for (let i = 0; i < this.devices.length; i++)
      this.sync(i)
    for (let i = 0; i < this.devices.length; i++)
      this.sync(i)
  }
}

function tasksOf(rows: EntityRow[]): EntityRowOf<'task'>[] {
  return rows.filter((r): r is EntityRowOf<'task'> => r.entity === 'task')
}

function randomIntent(rand: () => number, rows: EntityRow[], newId: string): LocalIntent {
  const tasks = tasksOf(rows)
  const pick = () => tasks[Math.floor(rand() * tasks.length)]?.id ?? 'none'
  const maybeParent = () => (rand() < 0.4 ? null : pick())
  const r = rand()
  if (r < 0.2 || tasks.length === 0)
    return { kind: 'command', command: makeCommand({ type: 'create_task', taskId: newId, name: newId, parentId: maybeParent(), order: Math.floor(rand() * 10), mountDirId: null }) }
  if (r < 0.35)
    return { kind: 'command', command: makeCommand({ taskId: pick() }) }
  if (r < 0.45)
    return { kind: 'command', command: makeCommand({ type: 'reopen', taskId: pick() }) }
  if (r < 0.5)
    return { kind: 'command', command: makeCommand({ type: 'drop', taskId: pick() }) }
  if (r < 0.65)
    return { kind: 'command', command: makeCommand({ type: 'move_task', taskId: pick(), parentId: maybeParent(), order: Math.floor(rand() * 10) }) }
  if (r < 0.75)
    return { kind: 'mutation', mutation: makeMutation({ entityId: pick(), patch: { name: `n${Math.floor(rand() * 100)}` } }) }
  if (r < 0.82)
    return { kind: 'command', command: makeCommand({ type: 'delete', taskId: pick() }) }
  if (r < 0.87)
    return { kind: 'command', command: makeCommand({ type: 'restore_from_trash', taskId: pick() }) }
  if (r < 0.92)
    return { kind: 'purge', taskId: pick() }
  const taskId = pick()
  return { kind: 'mutation', mutation: makeMutation({ entity: 'task_tag', entityId: `${taskId}|g`, patch: { taskId, tagId: 'g' } }) }
}

function expectReadable(rows: EntityRow[]): void {
  const tasks = tasksOf(rows)
  const tree = buildTaskTree(tasks)
  expect(tree.byId.size).toBe(tasks.length)
  for (const task of tasks) {
    effectiveStatus(task, tree)
    const { completedAt, heldAt, droppedAt } = task.data
    expect([completedAt, heldAt, droppedAt].filter(v => v != null).length).toBeLessThanOrEqual(1)
  }
}

describe('多设备收敛', () => {
  it.each(Array.from({ length: 40 }, (_, i) => i + 1))('随机交错 seed=%i：全部同步后各设备与服务器一致', (seed) => {
    const rand = mulberry32(seed)
    const world = new World(['A', 'B', 'C'])
    let created = 0
    for (let step = 0; step < 120; step++) {
      const i = Math.floor(rand() * world.devices.length)
      const roll = rand()
      if (roll < 0.65) {
        world.act(i, randomIntent(rand, displayRows(world.devices[i]!), `${world.devices[i]!.clientId}-${++created}`))
      }
      else if (roll < 0.95) {
        world.sync(i)
      }
      else {
        world.compact()
      }
      expectReadable(displayRows(world.devices[i]!))
    }
    world.syncAll()
    expect(world.server.head.seq).toBeGreaterThan(30)

    const expected = toSnapshot(world.server.head)
    for (const device of world.devices) {
      expect(device.pending).toEqual([])
      expect(toSnapshot(device.confirmed)).toEqual(expected)
    }
    expectReadable(materialize(world.server.head))
  })
})

describe('典型并发场景', () => {
  it('两台设备离线完成同一次重复任务，只产生一个后继', () => {
    const world = new World(['A', 'B'])
    world.seed(0, [makeTaskRow('t1', { repeatRuleId: 'r1', repeatRule: makeRepeatRule({ id: 'r1', cycle: 'daily' }) })])
    world.syncAll()

    expect(world.act(0, { kind: 'command', command: makeCommand({ taskId: 't1' }) })).toBe(true)
    expect(world.act(1, { kind: 'command', command: makeCommand({ taskId: 't1' }) })).toBe(true)
    world.syncAll()

    const tasks = tasksOf(materialize(world.server.head))
    expect(tasks.map(t => t.id).sort()).toEqual([repeatSuccessorId('r1', 1), 't1'].sort())
    expect(toSnapshot(world.devices[0]!.confirmed)).toEqual(toSnapshot(world.devices[1]!.confirmed))
  })

  it('两台设备离线把两个任务互相挂到对方下面：后写入的那个在读时成为根', () => {
    const world = new World(['A', 'B'])
    world.seed(0, [makeTaskRow('x', { groupType: 'parallel' }), makeTaskRow('y', { groupType: 'parallel' })])
    world.syncAll()

    expect(world.act(0, { kind: 'command', command: makeCommand({ type: 'move_task', taskId: 'x', parentId: 'y', order: 0 }) })).toBe(true)
    expect(world.act(1, { kind: 'command', command: makeCommand({ type: 'move_task', taskId: 'y', parentId: 'x', order: 0 }) })).toBe(true)
    world.syncAll()

    const rows = materialize(world.server.head)
    const tree = buildTaskTree(tasksOf(rows))
    expect(tree.roots.map(n => n.task.id)).toEqual(['y'])
    expect(tree.byId.get('x')?.parent?.task.id).toBe('y')
  })

  it('一台设备永久删除父任务，另一台离线在其下新建子任务：子任务保留并成为根', () => {
    const world = new World(['A', 'B'])
    world.seed(0, [makeTaskRow('p', { groupType: 'parallel' })])
    world.syncAll()

    expect(world.act(0, { kind: 'command', command: makeCommand({ type: 'delete', taskId: 'p' }) })).toBe(true)
    expect(world.act(0, { kind: 'purge', taskId: 'p' })).toBe(true)
    expect(world.act(1, { kind: 'command', command: makeCommand({ type: 'create_task', taskId: 'c', name: 'c', parentId: 'p', order: 0, mountDirId: null }) })).toBe(true)
    world.syncAll()

    const tasks = tasksOf(materialize(world.server.head))
    expect(tasks.find(t => t.id === 'p')).toBeUndefined()
    expect(tasks.find(t => t.id === 'c')?.data.parentId).toBe('p')
    expect(buildTaskTree(tasks).roots.map(n => n.task.id)).toEqual(['c'])
    expect(tasks.find(t => t.id === 'c')?.data.status).not.toBe(EXPLICIT_STATUS.DELETED)
  })
})
