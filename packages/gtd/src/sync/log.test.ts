import { describe, expect, it } from 'vitest'
import { createOf, makeTaskRow, makeTxn } from '../fixtures'
import { appendToHead, appendTransactions, compactLog, createServerLog, pullSince } from './log'
import { emptyReplica, materialize } from './replica'

const create = (id: string) => [createOf(makeTaskRow(id))]

describe('appendTransactions', () => {
  it('按到达顺序编号，seq 每用户连续', () => {
    let log = createServerLog('u1')
    log = appendTransactions(log, [makeTxn('A', 1, create('a1')), makeTxn('A', 2, create('a2'))]).log
    const res = appendTransactions(log, [makeTxn('B', 1, create('b1'))])
    expect(res.accepted.map(t => t.seq)).toEqual([3])
    expect(res.log.transactions.map(t => `${t.clientId}${t.clientSeq}@${t.seq}`)).toEqual(['A1@1', 'A2@2', 'B1@3'])
    expect(res.log.head.seq).toBe(3)
  })

  it('重发已接受的事务只确认、不重复编号', () => {
    const first = appendTransactions(createServerLog('u1'), [makeTxn('A', 1, create('a1'))])
    const again = appendTransactions(first.log, [makeTxn('A', 1, create('a1')), makeTxn('A', 2, create('a2'))])
    expect(again.accepted.map(t => t.clientSeq)).toEqual([2])
    expect(again.ackedClientSeq).toBe(2)
    expect(again.log.transactions).toHaveLength(2)
  })

  it('缺号时停下并要求从缺的那一号重发', () => {
    const res = appendTransactions(createServerLog('u1'), [makeTxn('A', 1, create('a1')), makeTxn('A', 3, create('a3'))])
    expect(res.accepted.map(t => t.clientSeq)).toEqual([1])
    expect(res.resendFrom).toBe(2)
    expect(res.ackedClientSeq).toBe(1)
  })

  it('一批里混入其他设备的事务直接拒绝', () => {
    expect(() => appendToHead(emptyReplica('u1'), [makeTxn('A', 1, create('a')), makeTxn('B', 1, create('b'))]))
      .toThrow(/同一设备/)
  })

  it('空批次只返回进度', () => {
    const res = appendToHead(emptyReplica('u1'), [])
    expect(res).toMatchObject({ accepted: [], ackedClientSeq: 0, resendFrom: null })
  })

  it('服务器不做业务判断：作用于不存在行的写入照样编号，只是重放时无效', () => {
    const res = appendTransactions(createServerLog('u1'), [makeTxn('A', 1, [{ op: 'set', entity: 'task', id: 'ghost', columns: { name: 'x' } }])])
    expect(res.accepted).toHaveLength(1)
    expect(materialize(res.log.head)).toEqual([])
  })
})

describe('pullSince 与 compactLog', () => {
  function threeTxns() {
    return appendTransactions(createServerLog('u1'), [
      makeTxn('A', 1, create('a')),
      makeTxn('A', 2, create('b')),
      makeTxn('A', 3, create('c')),
    ]).log
  }

  it('返回 afterSeq 之后的事务', () => {
    const pull = pullSince(threeTxns(), 1)
    expect(pull.snapshot).toBeNull()
    expect(pull.transactions.map(t => t.seq)).toEqual([2, 3])
  })

  it('只保留最近 keep 条事务', () => {
    const log = compactLog(threeTxns(), 1)
    expect(log.compactedSeq).toBe(2)
    expect(log.transactions.map(t => t.seq)).toEqual([3])
  })

  it('落后于压缩点的设备拿到当前状态的快照', () => {
    const log = appendTransactions(compactLog(threeTxns()), [makeTxn('B', 1, create('d'))]).log
    const behind = pullSince(log, 1)
    expect(behind.snapshot?.seq).toBe(4)
    expect(behind.snapshot?.rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(behind.transactions).toEqual([])
    const upToDate = pullSince(log, 3)
    expect(upToDate.snapshot).toBeNull()
    expect(upToDate.transactions.map(t => t.seq)).toEqual([4])
  })

  it('设备进度超过服务器（服务器数据被重置）时拿快照', () => {
    const pull = pullSince(createServerLog('u1'), 7)
    expect(pull.snapshot).toMatchObject({ seq: 0, rows: [] })
  })

  it('压缩后 clientSeq 进度仍在，重发仍被识别', () => {
    const res = appendTransactions(compactLog(threeTxns()), [makeTxn('A', 3, create('c'))])
    expect(res.accepted).toEqual([])
    expect(res.ackedClientSeq).toBe(3)
  })
})
