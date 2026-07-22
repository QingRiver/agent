/**
 * SyncEngine：无头守护进程。
 *
 * 唯一职责：在本地 IndexedDB 与远端 Server 之间可靠搬运数据。
 * 不关心 UI 框架、不关心透视渲染。用户编辑走 GtdStore → scheduleSync；
 * Engine 只响应 scheduleSync 与环境信号。
 *
 * 状态机：IDLE / SYNCING / ERROR / OFFLINE
 * 防幽灵闪烁：outbox 非空 → 只 push 不 pull
 */
import type { EntityRow, GtdCommand, GtdMutation, PullResponse, PushResponse } from '@agent/gtd'
import {
  clearAll,
  loadLastSyncId,
  loadOutbox,
  rebaseTransaction,
} from './row-store'

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'

export interface SyncApi {
  push: (body: { mutations: GtdMutation[], commands: GtdCommand[], lastSyncId: number }) => Promise<PushResponse>
  pull: (body: { lastSyncId: number }) => Promise<PullResponse>
}

function isMutation(item: GtdMutation | GtdCommand): item is GtdMutation {
  return 'op' in item
}

export class SyncEngine {
  private syncing = false
  private dirty = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private _status: SyncStatus = 'idle'
  private onStatusChange?: (status: SyncStatus) => void
  private onRejected?: (rejected: PushResponse['rejected']) => void
  private onSynced?: (changes: EntityRow[]) => void
  private api: SyncApi
  private daemons = false

  constructor(api: SyncApi) {
    this.api = api
  }

  /** 设置状态回调（UI 顶栏 icon） */
  setStatusListener(cb: (status: SyncStatus) => void): void {
    this.onStatusChange = cb
  }

  /** 设置 rejected 回调（toast 提示） */
  setRejectedListener(cb: (rejected: PushResponse['rejected']) => void): void {
    this.onRejected = cb
  }

  /** 设置 synced 回调：push/pull 后以服务端权威 changes 刷新调用方内存行 */
  setSyncedListener(cb: (changes: EntityRow[]) => void): void {
    this.onSynced = cb
  }

  private setStatus(status: SyncStatus): void {
    this._status = status
    this.onStatusChange?.(status)
  }

  /** 当前状态（只读） */
  get status(): SyncStatus {
    return this._status
  }

  /** debounce ~400ms 后 sync */
  scheduleSync(debounceMs = 400): void {
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => void this.sync(), debounceMs)
  }

  /** 同步循环 */
  async sync(): Promise<void> {
    // 状态机：SYNCING 中不并行
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
      const outbox = await loadOutbox()
      const lastSyncId = await loadLastSyncId()

      // 硬规则：outbox 非空 → 只 push；空 → pull
      const pushRes = outbox.length > 0
        ? await this.api.push({
            mutations: outbox.filter(isMutation) as GtdMutation[],
            commands: outbox.filter(i => !isMutation(i)) as GtdCommand[],
            lastSyncId,
          })
        : null

      if (pushRes) {
        // IDB 事务 rebase（ack/nack + changes + lastSyncId）
        await rebaseTransaction(pushRes)
        if (pushRes.rejected?.length) {
          this.onRejected?.(pushRes.rejected)
        }
        if (pushRes.changes.length > 0) {
          this.onSynced?.(pushRes.changes)
        }
      }
      else {
        // pull：只 merge changes + lastSyncId
        const pullRes = await this.api.pull({ lastSyncId })
        await rebaseTransaction({ applied: [], rejected: [], changes: pullRes.changes, serverSyncId: pullRes.serverSyncId })
        if (pullRes.changes.length > 0) {
          this.onSynced?.(pullRes.changes)
        }
      }

      this.setStatus('idle')
    }
    catch {
      this.setStatus('error')
      // 可选：指数退避后 scheduleSync
    }
    finally {
      this.syncing = false
      // dirty：SYNCING 期间有新编辑 → 再跑一轮
      if (this.dirty) {
        this.dirty = false
        this.scheduleSync(0)
      }
    }
  }

  /** 启动守护进程：仅注册 online/visibility/interval，不立即 sync（由 bootstrap/调度器触发） */
  startDaemons(): void {
    if (this.daemons) {
      return
    }
    this.daemons = true
    window.addEventListener('online', this.onOnline)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.intervalId = setInterval(() => void this.sync(), 5 * 60 * 1000)
  }

  /** 停止守护进程（登出用） */
  stopDaemons(): void {
    if (!this.daemons) {
      return
    }
    this.daemons = false
    window.removeEventListener('online', this.onOnline)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
    if (this.timer) {
      clearTimeout(this.timer)
    }
  }

  private intervalId: ReturnType<typeof setInterval> | null = null

  private onOnline = (): void => {
    void this.sync()
  }

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      void this.sync()
    }
  }

  /** 登出/换用户：清空本地数据 */
  async logout(): Promise<void> {
    this.stopDaemons()
    await clearAll()
    this.setStatus('idle')
  }

  /** 启动时灌库 + 同步：空库 pull(0) 灌行；非空库 push pending outbox / pull 增量；末尾统一 startDaemons */
  async bootstrap(): Promise<void> {
    await this.sync()
    this.startDaemons()
  }
}
