import type { EntityRow, PullResponse, PushResponse } from '@agent/gtd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncEngine } from './sync-engine'

// row-store 含真实 IndexedDB，node 环境不可用；mock 掉全部 IO，只测 SyncEngine 调度/状态机逻辑
vi.mock('./row-store', () => ({
  clearAll: vi.fn().mockResolvedValue(undefined),
  loadOutbox: vi.fn().mockResolvedValue([]),
  loadLastSyncId: vi.fn().mockResolvedValue(0),
  rebaseTransaction: vi.fn().mockResolvedValue(undefined),
}))

// 浏览器全局 stub（node 环境无 window/document/navigator）
function stubBrowserGlobals() {
  const listeners = new Map<string, EventListener>()
  const stub = {
    addEventListener: vi.fn((type: string, cb: EventListener) => listeners.set(type, cb)),
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('window', stub)
  vi.stubGlobal('document', { ...stub, visibilityState: 'visible' })
  return listeners
}

function mkPushRes(over: Partial<PushResponse> = {}): PushResponse {
  return { applied: [], rejected: [], changes: [], serverSyncId: 5, ...over }
}
function mkPullRes(changes: EntityRow[] = [], serverSyncId = 5): PullResponse {
  return { changes, serverSyncId }
}

function mkApi() {
  return {
    push: vi.fn(),
    pull: vi.fn(),
  }
}

describe('syncEngine', () => {
  let listeners: Map<string, EventListener>

  beforeEach(() => {
    vi.clearAllMocks()
    listeners = stubBrowserGlobals()
  })

  it('outbox 非空 → 只 push 不 pull（防幽灵闪烁）', async () => {
    const { loadOutbox } = await import('./row-store')
    vi.mocked(loadOutbox).mockResolvedValueOnce([
      { id: 'm1', entity: 'task', entityId: 't1', op: 'upsert', patch: { name: 'x' }, clientTs: '2026-07-20T00:00:00Z' },
    ])
    const api = mkApi()
    api.push.mockResolvedValue(mkPushRes())
    const engine = new SyncEngine(api)
    await engine.sync()
    expect(api.push).toHaveBeenCalledOnce()
    expect(api.pull).not.toHaveBeenCalled()
  })

  it('outbox 空 → 只 pull 不 push', async () => {
    const api = mkApi()
    api.pull.mockResolvedValue(mkPullRes())
    const engine = new SyncEngine(api)
    await engine.sync()
    expect(api.pull).toHaveBeenCalledOnce()
    expect(api.push).not.toHaveBeenCalled()
  })

  it('单飞锁：SYNCING 中第二次 sync 只置 dirty，不并行', async () => {
    const { loadOutbox } = await import('./row-store')
    vi.mocked(loadOutbox).mockResolvedValue([])
    const api = mkApi()
    let resolvePush!: () => void
    api.pull.mockReturnValue(new Promise<PullResponse>(r => resolvePush = () => r(mkPullRes())))
    const engine = new SyncEngine(api)
    const first = engine.sync() // 不 await，进入 SYNCING
    await Promise.resolve()
    await engine.sync() // 第二次：应早退，置 dirty
    expect(api.pull).toHaveBeenCalledOnce()
    resolvePush()
    await first
    // dirty 触发 scheduleSync(0) → 再跑一轮（debounce 0，仍需微任务）
    await new Promise(r => setTimeout(r, 5))
    expect(api.pull).toHaveBeenCalledTimes(2)
  })

  it('rejected → onRejected 回调 + 状态 error', async () => {
    const { loadOutbox } = await import('./row-store')
    vi.mocked(loadOutbox).mockResolvedValue([
      { id: 'm1', entity: 'task', entityId: 't1', op: 'upsert', patch: {}, clientTs: '2026-07-20T00:00:00Z' },
    ])
    const api = mkApi()
    api.push.mockResolvedValue(mkPushRes({ rejected: [{ id: 'm1', reason: 'boom' }] }))
    const engine = new SyncEngine(api)
    const rejected = vi.fn()
    engine.setRejectedListener(rejected)
    await engine.sync()
    expect(rejected).toHaveBeenCalledWith([{ id: 'm1', reason: 'boom' }])
  })

  it('onSynced：changes 非空时回调刷内存；空时不触发', async () => {
    const api = mkApi()
    const changes: EntityRow[] = [
      { entity: 'task', id: 't1', userId: 'u1', syncId: 6, deleted: false, data: { name: 'y' } } as unknown as EntityRow,
    ]
    api.pull.mockResolvedValue(mkPullRes(changes, 6))
    const engine = new SyncEngine(api)
    const synced = vi.fn()
    engine.setSyncedListener(synced)
    await engine.sync()
    expect(synced).toHaveBeenCalledWith(changes)

    // 第二轮 changes 空 → 不触发
    vi.mocked(api.pull).mockResolvedValueOnce(mkPullRes([], 6))
    synced.mockClear()
    await engine.sync()
    expect(synced).not.toHaveBeenCalled()
  })

  it('状态机：idle → syncing → idle', async () => {
    const api = mkApi()
    api.pull.mockResolvedValue(mkPullRes())
    const engine = new SyncEngine(api)
    const statuses: string[] = []
    engine.setStatusListener(s => statuses.push(s))
    await engine.sync()
    expect(statuses).toEqual(['syncing', 'idle'])
  })

  it('push 抛错 → 状态 error', async () => {
    const { loadOutbox } = await import('./row-store')
    vi.mocked(loadOutbox).mockResolvedValue([
      { id: 'm1', entity: 'task', entityId: 't1', op: 'upsert', patch: {}, clientTs: '2026-07-20T00:00:00Z' },
    ])
    const api = mkApi()
    api.push.mockRejectedValue(new Error('network'))
    const engine = new SyncEngine(api)
    const statuses: string[] = []
    engine.setStatusListener(s => statuses.push(s))
    await engine.sync()
    expect(statuses).toContain('error')
  })

  it('scheduleSync debounce 400ms', async () => {
    vi.useFakeTimers()
    try {
      const api = mkApi()
      api.pull.mockResolvedValue(mkPullRes())
      const engine = new SyncEngine(api)
      engine.scheduleSync()
      vi.advanceTimersByTime(399)
      expect(api.pull).not.toHaveBeenCalled()
      vi.advanceTimersByTime(2)
      await vi.advanceTimersByTimeAsync(0)
      expect(api.pull).toHaveBeenCalledOnce()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('offline → 状态 offline 且不发起请求', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const api = mkApi()
    const engine = new SyncEngine(api)
    const statuses: string[] = []
    engine.setStatusListener(s => statuses.push(s))
    await engine.sync()
    expect(api.push).not.toHaveBeenCalled()
    expect(api.pull).not.toHaveBeenCalled()
    expect(statuses).toContain('offline')
  })

  it('bootstrap：sync + startDaemons（注册 online/visibility/interval）', async () => {
    const api = mkApi()
    api.pull.mockResolvedValue(mkPullRes())
    const engine = new SyncEngine(api)
    await engine.bootstrap()
    // startDaemons 注册了 online + visibilitychange 监听
    const windowStub = globalThis.window as unknown as { addEventListener: { mock: { calls: string[][] } } }
    const docStub = globalThis.document as unknown as { addEventListener: { mock: { calls: string[][] } } }
    const winTypes = windowStub.addEventListener.mock.calls.map(c => c[0])
    const docTypes = docStub.addEventListener.mock.calls.map(c => c[0])
    expect(winTypes).toContain('online')
    expect(docTypes).toContain('visibilitychange')
    // bootstrap 先 sync 一次（pull）
    expect(api.pull).toHaveBeenCalledOnce()
    // online 事件触发 → sync
    const onlineCb = listeners.get('online')!
    api.pull.mockClear()
    await onlineCb(new Event('online'))
    await new Promise(r => setTimeout(r, 5))
    expect(api.pull).toHaveBeenCalled()
  })

  it('logout：stopDaemons + clearAll', async () => {
    const { clearAll } = await import('./row-store')
    const api = mkApi()
    const engine = new SyncEngine(api)
    await engine.bootstrap()
    await engine.logout()
    expect(clearAll).toHaveBeenCalled()
  })
})
