import type { EntityRow } from '../data/sync-schema'
import type { PullResult } from './log'
/**
 * 设备侧副本：服务器已确认的状态 + 本机还没确认的事务。
 * 界面永远是 predict = 把未确认事务按 clientSeq 叠在已确认状态上，不存第三份合并结果。
 */
import type { MaterializeOptions, ReplicaState } from './replica'
import type { Transaction, Write } from './txn'
import { applyTransaction, replayTransactions } from './replay'
import { emptyReplica, materialize } from './replica'
import { fromSnapshot } from './snapshot'

export interface ClientReplica {
  clientId: string
  confirmed: ReplicaState
  /** 按 clientSeq 升序。 */
  pending: Transaction[]
}

export function createClientReplica(userId: string, clientId: string): ClientReplica {
  return { clientId, confirmed: emptyReplica(userId), pending: [] }
}

function nextClientSeq(local: ClientReplica): number {
  const acked = local.confirmed.clientSeqs.get(local.clientId) ?? 0
  return Math.max(acked, local.pending.at(-1)?.clientSeq ?? 0) + 1
}

/** 把一次本地操作的写入记为下一条未确认事务。 */
export function enqueueTransaction(
  local: ClientReplica,
  input: { id: string, clientTs: string, writes: Write[] },
): { local: ClientReplica, txn: Transaction } {
  const txn: Transaction = { ...input, clientId: local.clientId, clientSeq: nextClientSeq(local) }
  return { local: { ...local, pending: [...local.pending, txn] }, txn }
}

/**
 * 收到服务器的拉取结果：有快照就整体换成快照，再重放新事务；
 * 已被服务器接受的本机事务（clientSeq 不大于已确认进度）从未确认里去掉。
 */
export function receivePull(local: ClientReplica, pull: PullResult): ClientReplica {
  let confirmed = pull.snapshot ? fromSnapshot(pull.snapshot) : local.confirmed
  confirmed = replayTransactions(confirmed, pull.transactions.filter(t => t.seq > confirmed.seq))
  const acked = confirmed.clientSeqs.get(local.clientId) ?? 0
  return { ...local, confirmed, pending: local.pending.filter(t => t.clientSeq > acked) }
}

/**
 * 服务器要求从 resendFrom 重发，但本机已经没有那一号（服务器数据被重置等）：
 * 换一个新的设备 id，未确认事务从 1 重新编号。本机有那一号时原样返回，下次同步照常重发。
 */
export function resolveResend(local: ClientReplica, resendFrom: number, newClientId: string): ClientReplica {
  if (local.pending.some(t => t.clientSeq === resendFrom))
    return local
  return {
    ...local,
    clientId: newClientId,
    pending: local.pending.map((t, i) => ({ ...t, clientId: newClientId, clientSeq: i + 1 })),
  }
}

/** 界面预测：未确认事务按顺序接在已确认状态之后重放。 */
export function predict(local: ClientReplica): ReplicaState {
  return local.pending.reduce(
    (state, txn) => applyTransaction(state, { ...txn, seq: state.seq + 1 }),
    local.confirmed,
  )
}

export function displayRows(local: ClientReplica, options?: MaterializeOptions): EntityRow[] {
  return materialize(predict(local), options)
}
