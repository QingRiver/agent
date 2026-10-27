/**
 * 快照：某个 seq 时副本状态的完整序列化。服务器用它压缩事务链，落后的设备用它追上。
 * fromSnapshot(toSnapshot(s)) 与 s 等价；在快照上继续重放与在原状态上重放结果相同。
 */
import type { ReplicaRow, ReplicaState } from './replica'
import { z } from 'zod'
import { SyncEntitySchema } from '../data/sync-schema'
import { rowKey } from './replica'

const id = z.string().min(1)

export const SnapshotSchema = z.object({
  userId: id,
  seq: z.number().int().nonnegative(),
  rows: z.array(z.object({
    entity: SyncEntitySchema,
    id,
    data: z.record(z.string(), z.unknown()),
    lastSeq: z.number().int().nonnegative(),
  })),
  tombstones: z.array(id),
  clientSeqs: z.record(z.string(), z.number().int().nonnegative()),
})

export type Snapshot = z.infer<typeof SnapshotSchema>

function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 行、墓碑按 key 排序，同一状态总是得到同一份快照。 */
export function toSnapshot(state: ReplicaState): Snapshot {
  const rows = [...state.rows.values()]
    .sort((a, b) => byCodeUnits(rowKey(a.entity, a.id), rowKey(b.entity, b.id)))
    .map(r => ({ entity: r.entity, id: r.id, data: { ...r.data }, lastSeq: r.lastSeq }))
  return {
    userId: state.userId,
    seq: state.seq,
    rows,
    tombstones: [...state.tombstones].sort(byCodeUnits),
    clientSeqs: Object.fromEntries([...state.clientSeqs].sort(([a], [b]) => byCodeUnits(a, b))),
  }
}

export function fromSnapshot(snapshot: Snapshot): ReplicaState {
  const rows = new Map<string, ReplicaRow>()
  for (const r of snapshot.rows)
    rows.set(rowKey(r.entity, r.id), { ...r, data: { ...r.data } })
  return {
    userId: snapshot.userId,
    seq: snapshot.seq,
    rows,
    tombstones: new Set(snapshot.tombstones),
    clientSeqs: new Map(Object.entries(snapshot.clientSeqs)),
  }
}
