/**
 * 事务重放测试助手：由行构造 create 写入、构造未编号 / 已编号事务。
 */
import type { EntityRow } from '../data/sync-schema'
import type { CreateWrite, StoredTransaction, Transaction, Write } from '../sync/txn'
import { SYNC_NOW } from './sync'

export function createOf(row: EntityRow): CreateWrite {
  return { op: 'create', entity: row.entity, id: row.id, data: { ...row.data } }
}

export function makeTxn(
  clientId: string,
  clientSeq: number,
  writes: Write[],
  opts: { id?: string, clientTs?: string } = {},
): Transaction {
  return {
    id: opts.id ?? `${clientId}-${clientSeq}`,
    clientId,
    clientSeq,
    clientTs: opts.clientTs ?? SYNC_NOW,
    writes,
  }
}

export function makeStoredTxn(seq: number, clientId: string, clientSeq: number, writes: Write[]): StoredTransaction {
  return { ...makeTxn(clientId, clientSeq, writes), seq }
}
