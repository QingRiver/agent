import type { ReplicaState } from './replica'
import type { StoredTransaction, Write } from './txn'
import { describe, expect, it } from 'vitest'
import { EXPLICIT_STATUS } from '../data/types'
import { createOf, makePerspective, makeStoredTxn, makeTaskRow, makeTaskTagRow } from '../fixtures'
import { applyTransaction, replayTransactions } from './replay'
import { emptyReplica, materialize, rowKey } from './replica'
import { TransactionSchema } from './txn'

/** 依次编号重放，每条事务来自 clientId 的下一个 clientSeq。 */
function run(...batches: { client: string, writes: Write[] }[]): ReplicaState {
  const seqs = new Map<string, number>()
  const txns: StoredTransaction[] = batches.map(({ client, writes }, i) => {
    const clientSeq = (seqs.get(client) ?? 0) + 1
    seqs.set(client, clientSeq)
    return makeStoredTxn(i + 1, client, clientSeq, writes)
  })
  return replayTransactions(emptyReplica('u1'), txns)
}

function taskData(state: ReplicaState, id: string): Record<string, unknown> | undefined {
  return state.rows.get(rowKey('task', id))?.data
}

describe('applyTransaction 顺序与重复', () => {
  it('seq 不大于当前进度的事务原样返回', () => {
    const s1 = run({ client: 'A', writes: [createOf(makeTaskRow('t1'))] })
    const again = applyTransaction(s1, makeStoredTxn(1, 'A', 1, [createOf(makeTaskRow('t2'))]))
    expect(again).toBe(s1)
  })

  it('跳号抛错', () => {
    expect(() => applyTransaction(emptyReplica('u1'), makeStoredTxn(2, 'A', 1, [createOf(makeTaskRow('t1'))])))
      .toThrow(/不连续/)
  })

  it('记录每台设备已重放到的 clientSeq', () => {
    const s = run(
      { client: 'A', writes: [createOf(makeTaskRow('t1'))] },
      { client: 'B', writes: [createOf(makeTaskRow('t2'))] },
      { client: 'A', writes: [createOf(makeTaskRow('t3'))] },
    )
    expect(s.seq).toBe(3)
    expect(Object.fromEntries(s.clientSeqs)).toEqual({ A: 2, B: 1 })
  })

  it('不修改传入的状态', () => {
    const s1 = run({ client: 'A', writes: [createOf(makeTaskRow('t1', { name: 'old' }))] })
    applyTransaction(s1, makeStoredTxn(2, 'A', 2, [{ op: 'set', entity: 'task', id: 't1', columns: { name: 'new' } }]))
    expect(taskData(s1, 't1')?.name).toBe('old')
  })
})

describe('create', () => {
  it('task 已存在时忽略，先到的新建为准', () => {
    const s = run(
      { client: 'A', writes: [createOf(makeTaskRow('t1', { name: 'A' }))] },
      { client: 'B', writes: [createOf(makeTaskRow('t1', { name: 'B' }))] },
    )
    expect(taskData(s, 't1')?.name).toBe('A')
  })

  it('已永久删除的 task id 不能再建', () => {
    const s = run(
      { client: 'A', writes: [createOf(makeTaskRow('t1'))] },
      { client: 'A', writes: [{ op: 'purge', entity: 'task', id: 't1' }] },
      { client: 'B', writes: [createOf(makeTaskRow('t1'))] },
    )
    expect(taskData(s, 't1')).toBeUndefined()
    expect(s.tombstones.has('t1')).toBe(true)
  })

  it('重复实例的来源任务不存在时忽略', () => {
    const s = run({ client: 'A', writes: [createOf(makeTaskRow('next', { repeatedFromTaskId: 'gone' }))] })
    expect(taskData(s, 'next')).toBeUndefined()
  })

  it('task_tag 指向不存在的任务时忽略', () => {
    const s = run({ client: 'A', writes: [createOf(makeTaskTagRow('ghost', 'g1'))] })
    expect(s.rows.size).toBe(0)
  })

  it('remove 把行移出状态，不留软删行', () => {
    const s = run(
      { client: 'A', writes: [createOf(makeTaskRow('t1')), createOf(makeTaskTagRow('t1', 'g1'))] },
      { client: 'B', writes: [{ op: 'remove', entity: 'task_tag', id: 't1|g1' }] },
    )
    expect(s.rows.has(rowKey('task_tag', 't1|g1'))).toBe(false)
  })

  it('remove 之后只有新的 create 能让行再出现；对它的 set 被忽略', () => {
    const createPerspective = (name: string): Write => {
      const { id: _id, ...data } = makePerspective({ id: 'p1', name })
      return { op: 'create', entity: 'perspective', id: 'p1', data }
    }
    const removed = run(
      { client: 'A', writes: [createPerspective('old')] },
      { client: 'B', writes: [{ op: 'remove', entity: 'perspective', id: 'p1' }] },
      { client: 'A', writes: [{ op: 'set', entity: 'perspective', id: 'p1', columns: { name: 'late' } }] },
    )
    expect(removed.rows.has(rowKey('perspective', 'p1'))).toBe(false)

    const recreated = run(
      { client: 'A', writes: [createPerspective('old')] },
      { client: 'B', writes: [{ op: 'remove', entity: 'perspective', id: 'p1' }] },
      { client: 'A', writes: [createPerspective('again')] },
    )
    expect(recreated.rows.get(rowKey('perspective', 'p1'))?.data.name).toBe('again')
  })
})

describe('set：每列以后到的为准', () => {
  it('不同列的并发修改都保留', () => {
    const s = run(
      { client: 'A', writes: [createOf(makeTaskRow('t1', { name: 'n0', note: null }))] },
      { client: 'A', writes: [{ op: 'set', entity: 'task', id: 't1', columns: { name: 'n1' } }] },
      { client: 'B', writes: [{ op: 'set', entity: 'task', id: 't1', columns: { note: 'note-b' } }] },
    )
    expect(taskData(s, 't1')).toMatchObject({ name: 'n1', note: 'note-b' })
  })

  it('同一列后到的覆盖先到的', () => {
    const s = run(
      { client: 'A', writes: [createOf(makeTaskRow('t1'))] },
      { client: 'A', writes: [{ op: 'set', entity: 'task', id: 't1', columns: { name: 'A' } }] },
      { client: 'B', writes: [{ op: 'set', entity: 'task', id: 't1', columns: { name: 'B' } }] },
    )
    expect(taskData(s, 't1')?.name).toBe('B')
  })

  it('目标不存在时忽略，不造出幽灵行', () => {
    const s = run({ client: 'A', writes: [{ op: 'set', entity: 'task', id: 'ghost', columns: { name: 'x' } }] })
    expect(s.rows.size).toBe(0)
  })

  it('整组写入的状态列不会拼出两个终态时间戳', () => {
    const T1 = '2026-07-01T00:00:00.000Z'
    const T2 = '2026-07-02T00:00:00.000Z'
    const s = run(
      { client: 'A', writes: [createOf(makeTaskRow('t1'))] },
      { client: 'A', writes: [{ op: 'set', entity: 'task', id: 't1', columns: { status: EXPLICIT_STATUS.COMPLETED, completedAt: T1, heldAt: null, droppedAt: null } }] },
      { client: 'B', writes: [{ op: 'set', entity: 'task', id: 't1', columns: { status: EXPLICIT_STATUS.HOLD, completedAt: null, heldAt: T2, droppedAt: null } }] },
    )
    expect(taskData(s, 't1')).toEqual(expect.objectContaining({ status: EXPLICIT_STATUS.HOLD, completedAt: null, heldAt: T2, droppedAt: null }))
  })

  it('lastSeq 记录最后一次写到这一行的事务', () => {
    const s = run(
      { client: 'A', writes: [createOf(makeTaskRow('t1')), createOf(makeTaskRow('t2'))] },
      { client: 'A', writes: [{ op: 'set', entity: 'task', id: 't2', columns: { name: 'x' } }] },
    )
    expect(s.rows.get(rowKey('task', 't1'))?.lastSeq).toBe(1)
    expect(s.rows.get(rowKey('task', 't2'))?.lastSeq).toBe(2)
  })
})

describe('purge', () => {
  it('移除任务、当时的子孙及其标签与附件，id 记入墓碑', () => {
    const s = run(
      {
        client: 'A',
        writes: [
          createOf(makeTaskRow('p')),
          createOf(makeTaskRow('c', { parentId: 'p' })),
          createOf(makeTaskRow('g', { parentId: 'c' })),
          createOf(makeTaskRow('other')),
          createOf(makeTaskTagRow('c', 'tag')),
          createOf(makeTaskTagRow('other', 'tag')),
        ],
      },
      { client: 'A', writes: [{ op: 'purge', entity: 'task', id: 'p' }] },
    )
    expect([...s.tombstones].sort()).toEqual(['c', 'g', 'p'])
    expect([...s.rows.keys()].sort()).toEqual([rowKey('task', 'other'), rowKey('task_tag', 'other|tag')])
  })

  it('purge 之后到达的写入对已删除 id 无效', () => {
    const s = run(
      { client: 'A', writes: [createOf(makeTaskRow('t1'))] },
      { client: 'A', writes: [{ op: 'purge', entity: 'task', id: 't1' }] },
      { client: 'B', writes: [{ op: 'set', entity: 'task', id: 't1', columns: { name: 'late' } }, createOf(makeTaskTagRow('t1', 'g'))] },
    )
    expect(s.rows.size).toBe(0)
  })

  it('purge 之前被移到其他父下的子任务不受影响', () => {
    const s = run(
      { client: 'A', writes: [createOf(makeTaskRow('p')), createOf(makeTaskRow('q')), createOf(makeTaskRow('c', { parentId: 'p' }))] },
      { client: 'B', writes: [{ op: 'set', entity: 'task', id: 'c', columns: { parentId: 'q' } }] },
      { client: 'A', writes: [{ op: 'purge', entity: 'task', id: 'p' }] },
    )
    expect(taskData(s, 'c')?.parentId).toBe('q')
  })
})

describe('materialize', () => {
  it('输出 EntityRow，syncId = lastSeq，按 entity、id 排序', () => {
    const s = run({ client: 'A', writes: [createOf(makeTaskRow('b')), createOf(makeTaskRow('a')), createOf(makeTaskTagRow('a', 'g'))] })
    const rows = materialize(s)
    expect(rows.map(r => `${r.entity}:${r.id}`)).toEqual(['task:a', 'task:b', 'task_tag:a|g'])
    expect(rows.every(r => r.syncId === 1 && r.userId === 'u1')).toBe(true)
  })

  it('任务的 mountDirId 输出为根任务的挂载', () => {
    const s = run({ client: 'A', writes: [createOf(makeTaskRow('r', { mountDirId: 'd1' })), createOf(makeTaskRow('c', { parentId: 'r', mountDirId: 'stale' }))] })
    const mount = (id: string) => (materialize(s).find(r => r.id === id)?.data as { mountDirId: string | null }).mountDirId
    expect(mount('c')).toBe('d1')
    expect(mount('r')).toBe('d1')
  })

  it('失效挂载输出为收件箱（null）', () => {
    const s = run({ client: 'A', writes: [createOf(makeTaskRow('r', { mountDirId: 'gone' })), createOf(makeTaskRow('c', { parentId: 'r', mountDirId: 'gone' }))] })
    const rows = materialize(s, { isMountValid: id => id !== 'gone' })
    expect(rows.map(r => (r.data as { mountDirId: string | null }).mountDirId)).toEqual([null, null])
  })

  it('不修改副本里存的列', () => {
    const s = run({ client: 'A', writes: [createOf(makeTaskRow('r', { mountDirId: 'gone' }))] })
    materialize(s, { isMountValid: () => false })
    expect(taskData(s, 'r')?.mountDirId).toBe('gone')
  })

  it('isTagLive 过滤已删除标签的绑定', () => {
    const s = run({ client: 'A', writes: [createOf(makeTaskRow('a')), createOf(makeTaskTagRow('a', 'live')), createOf(makeTaskTagRow('a', 'dead'))] })
    const rows = materialize(s, { isTagLive: id => id === 'live' })
    expect(rows.filter(r => r.entity === 'task_tag').map(r => r.id)).toEqual(['a|live'])
  })
})

describe('transactionSchema', () => {
  const base = { id: 'x', clientId: 'A', clientSeq: 1, clientTs: '2026-07-01T00:00:00.000Z' }

  it('接受完整的 create 与整组 set', () => {
    const writes: Write[] = [
      createOf(makeTaskRow('t1')),
      { op: 'set', entity: 'task', id: 't1', columns: { plannedMode: 'none', plannedDate: null } },
    ]
    expect(TransactionSchema.safeParse({ ...base, writes }).success).toBe(true)
  })

  it.each<[string, unknown]>([
    ['create 缺列', { op: 'create', entity: 'task', id: 't1', data: { name: 'x' } }],
    ['task_tag id 与内容不符', { op: 'create', entity: 'task_tag', id: 'a|b', data: { taskId: 'a', tagId: 'c' } }],
    ['空 set', { op: 'set', entity: 'task', id: 't1', columns: {} }],
    ['未知列', { op: 'set', entity: 'task', id: 't1', columns: { bogus: 1 } }],
    ['状态列只写一部分', { op: 'set', entity: 'task', id: 't1', columns: { status: 'completed' } }],
    ['task 用 remove', { op: 'remove', entity: 'task', id: 't1' }],
    ['set 带 deleted', { op: 'set', entity: 'task_tag', id: 'a|b', columns: {}, deleted: true }],
    ['改 task_tag 的列', { op: 'set', entity: 'task_tag', id: 'a|b', columns: { tagId: 'c' } }],
  ])('拒绝：%s', (_, write) => {
    expect(TransactionSchema.safeParse({ ...base, writes: [write] }).success).toBe(false)
  })

  it('拒绝空事务', () => {
    expect(TransactionSchema.safeParse({ ...base, writes: [] }).success).toBe(false)
  })
})
