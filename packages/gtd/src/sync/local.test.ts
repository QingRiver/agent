import type { ClientReplica } from './local'
import type { ServerLog } from './log'
import type { Write } from './txn'
import { describe, expect, it } from 'vitest'
import { createOf, makeTaskRow, SYNC_NOW } from '../fixtures'
import { createClientReplica, displayRows, enqueueTransaction, predict, receivePull, resolveResend } from './local'
import { appendTransactions, compactLog, createServerLog, pullSince } from './log'

function enqueue(local: ClientReplica, writes: Write[]): ClientReplica {
  return enqueueTransaction(local, { id: `${local.clientId}-${local.pending.length}`, clientTs: SYNC_NOW, writes }).local
}

/** 内存服务器：sync = 上传本机未确认事务，再拉取。 */
function makeServer() {
  let log: ServerLog = createServerLog('u1')
  return {
    get log() {
      return log
    },
    compact() {
      log = compactLog(log)
    },
    pull(local: ClientReplica): ClientReplica {
      return receivePull(local, pullSince(log, local.confirmed.seq))
    },
    sync(local: ClientReplica): ClientReplica {
      if (local.pending.length > 0)
        log = appendTransactions(log, local.pending).log
      return this.pull(local)
    },
  }
}

const names = (local: ClientReplica) => displayRows(local).map(r => (r.data as { name: string }).name)

describe('clientReplica', () => {
  it('未确认事务立刻显示，clientSeq 从 1 连续', () => {
    let a = createClientReplica('u1', 'A')
    a = enqueue(a, [createOf(makeTaskRow('t1', { name: 'one' }))])
    a = enqueue(a, [createOf(makeTaskRow('t2', { name: 'two' }))])
    expect(a.pending.map(t => t.clientSeq)).toEqual([1, 2])
    expect(names(a)).toEqual(['one', 'two'])
    expect(a.confirmed.seq).toBe(0)
  })

  it('服务器确认后从未确认里移除，显示不变', () => {
    const server = makeServer()
    let a = enqueue(createClientReplica('u1', 'A'), [createOf(makeTaskRow('t1', { name: 'one' }))])
    const before = names(a)
    a = server.sync(a)
    expect(a.pending).toEqual([])
    expect(a.confirmed.seq).toBe(1)
    expect(names(a)).toEqual(before)
  })

  it('确认后继续编号，不复用已确认的 clientSeq', () => {
    const server = makeServer()
    let a = server.sync(enqueue(createClientReplica('u1', 'A'), [createOf(makeTaskRow('t1'))]))
    a = enqueue(a, [createOf(makeTaskRow('t2'))])
    expect(a.pending[0]?.clientSeq).toBe(2)
    server.sync(a)
    expect(server.log.transactions.map(t => t.clientSeq)).toEqual([1, 2])
  })

  it('上传成功但确认丢失时，重发不会重复编号', () => {
    const server = makeServer()
    const a = enqueue(createClientReplica('u1', 'A'), [createOf(makeTaskRow('t1'))])
    server.sync(a)
    const retried = server.sync(a)
    expect(server.log.transactions).toHaveLength(1)
    expect(retried.pending).toEqual([])
  })

  it('同一列：本机未确认的写入在显示上盖过别人已确认的，上传后各设备都以它为准', () => {
    const server = makeServer()
    let a = server.sync(enqueue(createClientReplica('u1', 'A'), [createOf(makeTaskRow('t1', { name: 'base' }))]))
    let b = server.sync(createClientReplica('u1', 'B'))

    b = enqueue(b, [{ op: 'set', entity: 'task', id: 't1', columns: { name: 'from-b' } }])
    a = enqueue(a, [{ op: 'set', entity: 'task', id: 't1', columns: { name: 'from-a' } }])
    b = server.sync(b)

    a = server.pull(a)
    expect(names(a)).toEqual(['from-a'])
    expect(a.pending).toHaveLength(1)

    a = server.sync(a)
    b = server.sync(b)
    expect(names(a)).toEqual(['from-a'])
    expect(names(b)).toEqual(['from-a'])
  })

  it('离线很久后从快照追上', () => {
    const server = makeServer()
    let a = createClientReplica('u1', 'A')
    for (let i = 0; i < 3; i++)
      a = server.sync(enqueue(a, [createOf(makeTaskRow(`t${i}`, { name: `n${i}` }))]))
    server.compact()
    const b = server.pull(createClientReplica('u1', 'B'))
    expect(b.confirmed.seq).toBe(3)
    expect(names(b)).toEqual(['n0', 'n1', 'n2'])
  })

  it('服务器数据被重置：设备换成服务器快照，未确认事务换新设备 id 重新编号后上传', () => {
    const old = makeServer()
    let a = old.sync(enqueue(createClientReplica('u1', 'A'), [createOf(makeTaskRow('t1', { name: 'old' }))]))
    a = enqueue(a, [createOf(makeTaskRow('t2', { name: 'offline' }))])

    const fresh = makeServer()
    a = fresh.pull(a)
    expect(a.confirmed.seq).toBe(0)
    expect(names(a)).toEqual(['offline'])

    const res = appendTransactions(fresh.log, a.pending)
    expect(res.resendFrom).toBe(1)
    a = resolveResend(a, 1, 'A2')
    expect(a.pending.map(t => `${t.clientId}#${t.clientSeq}`)).toEqual(['A2#1'])
    a = fresh.sync(a)
    expect(a.pending).toEqual([])
    expect(names(a)).toEqual(['offline'])
  })

  it('本机还有要重发的那一号时不换设备 id', () => {
    const a = enqueue(createClientReplica('u1', 'A'), [createOf(makeTaskRow('t1'))])
    expect(resolveResend(a, 1, 'A2')).toBe(a)
  })

  it('预测不修改已确认状态', () => {
    const a = enqueue(createClientReplica('u1', 'A'), [createOf(makeTaskRow('t1'))])
    expect(predict(a).seq).toBe(1)
    expect(a.confirmed.seq).toBe(0)
    expect(a.confirmed.rows.size).toBe(0)
  })
})
