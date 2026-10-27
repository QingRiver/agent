/**
 * SyncEngine：无头守护进程，只做一件事——把本机未确认事务带到 POST /gtd/sync，
 * 把返回的新事务（或快照）重放进已确认状态并落盘。
 *
 * 没有冲突、拒绝与回滚：服务器对合法事务只排序不裁决，界面永远是 predict(已确认 + 未确认)。
 * 一轮同步期间又有新编辑时，本轮结束后立刻再跑一轮。
 */
import type { ReplicaState, SyncRequest, SyncResponse } from '@agent/gtd'
import type { PendingQueue, ReplicaStorage } from './replica-store'
import { receivePull } from '@agent/gtd'

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'

export interface SyncEngineOptions {
  storage: ReplicaStorage
  request: (req: SyncRequest) => Promise<SyncResponse>
  /** 当前内存里的已确认状态；还没加载时为 null，此时不同步。 */
  getConfirmed: () => ReplicaState | null
  /** 一轮同步落盘后回调：新的已确认状态与磁盘上的未确认队列。 */
  onSynced: (confirmed: ReplicaState, queue: PendingQueue) => void
  newClientId?: () => string
}

const POLL_MS = 5 * 60 * 1000

export class SyncEngine {
  private syncing = false
  private dirty = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null
  private daemons = false
  private _status: SyncStatus = 'idle'
  private onStatusChange?: (status: SyncStatus) => void
  private readonly options: SyncEngineOptions

  constructor(options: SyncEngineOptions) {
    this.options = options
  }

  setStatusListener(cb: (status: SyncStatus) => void): void {
    this.onStatusChange = cb
  }

  get status(): SyncStatus {
    return this._status
  }

  private setStatus(status: SyncStatus): void {
    this._status = status
    this.onStatusChange?.(status)
  }

  scheduleSync(debounceMs = 400): void {
    if (this.timer)
      clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.sync(), debounceMs)
  }

  async sync(): Promise<void> {
    if (this.syncing) {
      this.dirty = true
      return
    }
    if (!navigator.onLine) {
      this.setStatus('offline')
      return
    }
    this.syncing = true
    this.setStatus('syncing')
    try {
      if (await this.round())
        this.dirty = true
      this.setStatus('idle')
    }
    catch {
      this.dirty = false
      this.setStatus('error')
    }
    finally {
      this.syncing = false
    }
    if (this.dirty) {
      this.dirty = false
      await this.sync()
    }
  }

  /** 一次往返；返回是否需要立刻再跑一轮。 */
  private async round(): Promise<boolean> {
    const { storage, request, getConfirmed, onSynced } = this.options
    const confirmed = getConfirmed()
    if (!confirmed)
      return false
    const queue = await storage.loadPending()
    const res = await request({ clientId: queue.clientId, afterSeq: confirmed.seq, transactions: queue.pending })
    const next = receivePull({ ...queue, confirmed }, res)
    await storage.saveConfirmed(confirmed, next.confirmed, {
      replaced: res.snapshot != null,
      clientId: queue.clientId,
      ackedClientSeq: res.ackedClientSeq,
    })
    if (res.resendFrom != null)
      await storage.resolveResend(queue.clientId, res.resendFrom, this.options.newClientId?.() ?? crypto.randomUUID())
    const after = await storage.loadPending()
    onSynced(next.confirmed, after)
    const sent = new Set(queue.pending.map(t => t.id))
    return res.resendFrom != null || after.pending.some(t => !sent.has(t.id))
  }

  /** 只注册 online / 可见性 / 定时拉取，不立即同步。 */
  startDaemons(): void {
    if (this.daemons)
      return
    this.daemons = true
    window.addEventListener('online', this.onOnline)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.intervalId = setInterval(() => void this.sync(), POLL_MS)
  }

  stopDaemons(): void {
    if (!this.daemons)
      return
    this.daemons = false
    window.removeEventListener('online', this.onOnline)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    if (this.intervalId)
      clearInterval(this.intervalId)
    if (this.timer)
      clearTimeout(this.timer)
  }

  private onOnline = (): void => {
    void this.sync()
  }

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible')
      void this.sync()
  }

  /** 登出 / 换用户：停守护进程并清空本机副本。 */
  async logout(): Promise<void> {
    this.stopDaemons()
    await this.options.storage.clear()
    this.setStatus('idle')
  }

  async bootstrap(): Promise<void> {
    await this.sync()
    this.startDaemons()
  }
}
