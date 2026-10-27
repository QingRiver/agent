/**
 * 按 seq 重放事务。纯函数，服务器、设备的已确认部分、设备的界面预测都调用它。
 *
 * - create：task 已存在或已永久删除时忽略（先到的新建为准）；其余实体整行覆盖。
 *   task_tag / attachment 指向的任务不存在时忽略；重复实例的来源任务不存在时忽略。
 * - set：目标不存在时忽略；只覆盖写到的列。
 * - remove：非 task 行移出状态，不留软删行。
 * - purge：移除任务及其当时的全部子孙、以及挂在它们上面的 task_tag / attachment，id 记入墓碑。
 */
import type { EntityRowOf } from '../data/sync-schema'
import type { ReplicaRow, ReplicaState } from './replica'
import type { CreateWrite, PurgeWrite, RemoveWrite, SetWrite, StoredTransaction } from './txn'
import { buildTaskTree, subtree } from '../structure/tree'
import { rowKey } from './replica'

interface Draft {
  rows: Map<string, ReplicaRow>
  tombstones: Set<string>
  seq: number
}

function taskExists(draft: Draft, taskId: unknown): boolean {
  return typeof taskId === 'string' && draft.rows.has(rowKey('task', taskId))
}

function applyCreate(draft: Draft, write: CreateWrite): void {
  const key = rowKey(write.entity, write.id)
  const row: ReplicaRow = {
    entity: write.entity,
    id: write.id,
    data: { ...write.data },
    lastSeq: draft.seq,
  }
  if (write.entity === 'task') {
    if (draft.tombstones.has(write.id) || draft.rows.has(key))
      return
    const source = write.data.repeatedFromTaskId
    if (source != null && !taskExists(draft, source))
      return
    draft.rows.set(key, row)
    return
  }
  if ((write.entity === 'task_tag' || write.entity === 'attachment') && !taskExists(draft, write.data.taskId))
    return
  draft.rows.set(key, row)
}

function applySet(draft: Draft, write: SetWrite): void {
  const key = rowKey(write.entity, write.id)
  const existing = draft.rows.get(key)
  if (!existing)
    return
  draft.rows.set(key, {
    ...existing,
    data: { ...existing.data, ...write.columns },
    lastSeq: draft.seq,
  })
}

function applyRemove(draft: Draft, write: RemoveWrite): void {
  draft.rows.delete(rowKey(write.entity, write.id))
}

function taskRowsOf(draft: Draft): EntityRowOf<'task'>[] {
  const tasks: EntityRowOf<'task'>[] = []
  for (const row of draft.rows.values()) {
    if (row.entity === 'task') {
      tasks.push({
        entity: 'task',
        id: row.id,
        userId: '',
        syncId: row.lastSeq,
        deleted: false,
        data: row.data as EntityRowOf<'task'>['data'],
      })
    }
  }
  return tasks
}

function applyPurge(draft: Draft, write: PurgeWrite): void {
  if (!taskExists(draft, write.id))
    return
  const tree = buildTaskTree(taskRowsOf(draft))
  const purged = new Set([write.id, ...subtree(tree, write.id).map(t => t.id)])
  for (const taskId of purged) {
    draft.rows.delete(rowKey('task', taskId))
    draft.tombstones.add(taskId)
  }
  for (const [key, row] of draft.rows) {
    if ((row.entity === 'task_tag' || row.entity === 'attachment') && purged.has(row.data.taskId as string))
      draft.rows.delete(key)
  }
}

/**
 * 把一条已编号事务应用到副本。seq 不大于当前进度时原样返回（重复送达）；
 * 跳号时抛错，调用方须先补齐缺失的事务或换快照。
 */
export function applyTransaction(state: ReplicaState, txn: StoredTransaction): ReplicaState {
  if (txn.seq <= state.seq)
    return state
  if (txn.seq !== state.seq + 1)
    throw new Error(`transaction seq ${txn.seq} 不连续，期望 ${state.seq + 1}`)
  const draft: Draft = { rows: new Map(state.rows), tombstones: new Set(state.tombstones), seq: txn.seq }
  for (const write of txn.writes) {
    if (write.op === 'create')
      applyCreate(draft, write)
    else if (write.op === 'set')
      applySet(draft, write)
    else if (write.op === 'remove')
      applyRemove(draft, write)
    else
      applyPurge(draft, write)
  }
  const clientSeqs = new Map(state.clientSeqs)
  clientSeqs.set(txn.clientId, Math.max(clientSeqs.get(txn.clientId) ?? 0, txn.clientSeq))
  return { userId: state.userId, seq: txn.seq, rows: draft.rows, tombstones: draft.tombstones, clientSeqs }
}

/** 依次应用；txns 须按 seq 升序。 */
export function replayTransactions(state: ReplicaState, txns: readonly StoredTransaction[]): ReplicaState {
  return txns.reduce(applyTransaction, state)
}
