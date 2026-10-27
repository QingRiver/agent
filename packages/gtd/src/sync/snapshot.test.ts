import type { StoredTransaction } from './txn'
import { describe, expect, it } from 'vitest'
import { createOf, makeStoredTxn, makeTaskRow, makeTaskTagRow } from '../fixtures'
import { replayTransactions } from './replay'
import { emptyReplica, materialize } from './replica'
import { fromSnapshot, SnapshotSchema, toSnapshot } from './snapshot'

const txns: StoredTransaction[] = [
  makeStoredTxn(1, 'A', 1, [createOf(makeTaskRow('p')), createOf(makeTaskRow('c', { parentId: 'p' })), createOf(makeTaskTagRow('c', 'g'))]),
  makeStoredTxn(2, 'B', 1, [{ op: 'set', entity: 'task', id: 'c', columns: { name: 'renamed' } }]),
  makeStoredTxn(3, 'A', 2, [createOf(makeTaskRow('x'))]),
  makeStoredTxn(4, 'A', 3, [{ op: 'purge', entity: 'task', id: 'x' }]),
  makeStoredTxn(5, 'B', 2, [{ op: 'remove', entity: 'task_tag', id: 'c|g' }]),
]

describe('snapshot', () => {
  it('往返后状态等价', () => {
    const state = replayTransactions(emptyReplica('u1'), txns)
    const back = fromSnapshot(toSnapshot(state))
    expect(back.seq).toBe(5)
    expect(materialize(back)).toEqual(materialize(state))
    expect([...back.tombstones]).toEqual(['x'])
    expect(Object.fromEntries(back.clientSeqs)).toEqual({ A: 3, B: 2 })
  })

  it('经过 JSON 序列化仍满足 schema', () => {
    const snapshot = toSnapshot(replayTransactions(emptyReplica('u1'), txns))
    const parsed = SnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)))
    expect(parsed).toEqual(snapshot)
  })

  it('同一状态总是得到同一份快照，与行插入顺序无关', () => {
    const forward = replayTransactions(emptyReplica('u1'), txns)
    const reordered = fromSnapshot({ ...toSnapshot(forward), rows: [...toSnapshot(forward).rows].reverse() })
    expect(JSON.stringify(toSnapshot(reordered))).toBe(JSON.stringify(toSnapshot(forward)))
  })

  it.each([0, 1, 2, 3, 4, 5])('在 seq=%i 处取快照再继续重放，与一口气重放相同', (cut) => {
    const full = replayTransactions(emptyReplica('u1'), txns)
    const prefix = replayTransactions(emptyReplica('u1'), txns.slice(0, cut))
    const resumed = replayTransactions(fromSnapshot(toSnapshot(prefix)), txns.slice(cut))
    expect(toSnapshot(resumed)).toEqual(toSnapshot(full))
  })

  it('快照是深拷贝，修改不影响原状态', () => {
    const state = replayTransactions(emptyReplica('u1'), txns)
    const snapshot = toSnapshot(state)
    snapshot.rows[0]!.data.name = 'mutated'
    expect(materialize(state).some(r => (r.data as { name?: string }).name === 'mutated')).toBe(false)
  })
})
