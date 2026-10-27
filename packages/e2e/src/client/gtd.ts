import type { ClientReplica, EntityRow, LocalIntent, MaterializeOptions, SyncResponse } from '@agent/gtd'
import { randomUUID } from 'node:crypto'
import { createClientReplica, displayRows, emitWrites, enqueueTransaction, receivePull } from '@agent/gtd'
import { e2eFetch } from './auth'

/**
 * 测试用的一台 GTD 设备：内存副本，经 POST /gtd/sync 与服务器往返。
 * 写入与浏览器一样由 @agent/gtd 的 emitWrites 在当前状态上生成。
 */
export class GtdDevice {
  private local: ClientReplica
  private readonly token: string

  constructor(token: string) {
    this.token = token
    this.local = createClientReplica('e2e', `e2e-${randomUUID()}`)
  }

  async sync(): Promise<void> {
    const res = await e2eFetch<SyncResponse>(this.token, '/gtd/sync', {
      method: 'POST',
      body: JSON.stringify({
        clientId: this.local.clientId,
        afterSeq: this.local.confirmed.seq,
        transactions: this.local.pending,
      }),
    })
    if (res.resendFrom !== null)
      throw new Error(`GTD 同步要求从 clientSeq ${res.resendFrom} 重发`)
    this.local = receivePull(this.local, res)
    if (this.local.pending.length > 0)
      throw new Error(`GTD 事务未被接受: ${JSON.stringify(this.local.pending)}`)
  }

  /** 在服务器最新状态上执行一次本地操作并上传。 */
  async act(intents: LocalIntent[]): Promise<void> {
    await this.sync()
    const writes = emitWrites(displayRows(this.local), intents, this.local.confirmed.userId)
    if (writes.length === 0)
      return
    this.local = enqueueTransaction(this.local, { id: randomUUID(), clientTs: new Date().toISOString(), writes }).local
    await this.sync()
  }

  async rows(options?: MaterializeOptions): Promise<EntityRow[]> {
    await this.sync()
    return displayRows(this.local, options)
  }
}
