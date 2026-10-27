/**
 * 服务器侧的事务链（每用户一份）：编号、追加、拉取、压缩。不做业务判断。
 * gateway 在用户锁里调用这些函数，并把 head 与事务持久化。
 */
import type { ReplicaState } from './replica'
import type { Snapshot } from './snapshot'
import type { StoredTransaction, Transaction } from './txn'
import { applyTransaction } from './replay'
import { emptyReplica } from './replica'
import { toSnapshot } from './snapshot'

export interface ServerLog {
  /** 当前状态，查询直接用。 */
  head: ReplicaState
  /** 已丢弃的事务前缀：seq 不大于它的事务不再保存。 */
  compactedSeq: number
  /** compactedSeq 之后的事务，seq 连续，最后一条等于 head.seq。 */
  transactions: StoredTransaction[]
}

export interface AppendResult {
  head: ReplicaState
  /** 本次新编号的事务。 */
  accepted: StoredTransaction[]
  /** 该设备已被接受的最大 clientSeq（含此前已接受的重发）。 */
  ackedClientSeq: number
  /** 中间缺号时，设备应从这一号起重发；无缺号为 null。 */
  resendFrom: number | null
}

export interface PullResult {
  /** 设备进度早于压缩点时给出当前状态的快照，设备须先换成它。 */
  snapshot: Snapshot | null
  transactions: StoredTransaction[]
}

export function createServerLog(userId: string): ServerLog {
  return { head: emptyReplica(userId), compactedSeq: 0, transactions: [] }
}

/**
 * 把同一设备的一批事务（按 clientSeq 升序）接到 head 之后。
 * 已接受过的 clientSeq 视为重发，直接确认；出现缺号就停下，返回从哪一号重发。
 */
export function appendToHead(head: ReplicaState, batch: readonly Transaction[]): AppendResult {
  const clientId = batch[0]?.clientId
  if (batch.some(t => t.clientId !== clientId))
    throw new Error('一批事务必须来自同一设备')
  let next = head
  const accepted: StoredTransaction[] = []
  let resendFrom: number | null = null
  for (const txn of batch) {
    const last = next.clientSeqs.get(txn.clientId) ?? 0
    if (txn.clientSeq <= last)
      continue
    if (txn.clientSeq !== last + 1) {
      resendFrom = last + 1
      break
    }
    const stored: StoredTransaction = { ...txn, seq: next.seq + 1 }
    next = applyTransaction(next, stored)
    accepted.push(stored)
  }
  const ackedClientSeq = clientId == null ? 0 : next.clientSeqs.get(clientId) ?? 0
  return { head: next, accepted, ackedClientSeq, resendFrom }
}

export function appendTransactions(log: ServerLog, batch: readonly Transaction[]): AppendResult & { log: ServerLog } {
  const result = appendToHead(log.head, batch)
  return { ...result, log: { ...log, head: result.head, transactions: [...log.transactions, ...result.accepted] } }
}

/**
 * 设备的进度无法用事务补齐时要换快照：早于压缩点，或超过服务器进度（服务器数据被重置）。
 */
export function needsSnapshot(afterSeq: number, head: { seq: number }, compactedSeq: number): boolean {
  return afterSeq < compactedSeq || afterSeq > head.seq
}

/** 设备已重放到 afterSeq，返回它还没见过的部分。 */
export function pullSince(log: ServerLog, afterSeq: number): PullResult {
  if (needsSnapshot(afterSeq, log.head, log.compactedSeq))
    return { snapshot: toSnapshot(log.head), transactions: [] }
  return { snapshot: null, transactions: log.transactions.filter(t => t.seq > afterSeq) }
}

/** 只保留最近 keep 条事务。随时可做，不需要等所有设备追上；落后的设备下次拉取拿快照。 */
export function compactLog(log: ServerLog, keep = 0): ServerLog {
  const compactedSeq = Math.max(log.compactedSeq, log.head.seq - keep)
  return { ...log, compactedSeq, transactions: log.transactions.filter(t => t.seq > compactedSeq) }
}
