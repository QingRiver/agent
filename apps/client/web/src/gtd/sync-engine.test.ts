import type { ClientReplica, LocalIntent, ReplicaState, SyncRequest, SyncResponse, Transaction } from '@agent/gtd'
import type { PendingQueue, ReplicaStorage } from './replica-store'
import {
  appendTransactions,
  createClientReplica,
  createServerLog,
  displayRows,
  emitWrites,
  pullSince,
  resolveResend,
} from '@agent/gtd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncEngine } from './sync-engine'

const USER = 'u1'
const TS = '2026-07-20T00:00:00.000Z'

function stubBrowserGlobals(onLine = true) {
  const stub = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('navigator', { onLine })
  vi.stubGlobal('window', stub)
  vi.stubGlobal('document', { ...stub, visibilityState: 'visible' })
}

/** 与 IndexedDB 实现同语义的内存存储。 */
function memoryStorage(clientId: string): ReplicaStorage & { replica: () => ClientReplica } {
  let state: ClientReplica = createClientReplica(USER, clientId)
  let lastClientSeq = 0
  return {
    replica: () => state,
    load: async () => state,
    loadPending: async () => ({ clientId: state.clientId, pending: [...state.pending] }),
    appendPending: async (input) => {
      const acked = state.confirmed.clientSeqs.get(state.clientId) ?? 0
      const clientSeq = Math.max(lastClientSeq, acked, state.pending.at(-1)?.clientSeq ?? 0) + 1
      lastClientSeq = clientSeq
      const txn: Transaction = { ...input, clientId: state.clientId, clientSeq }
      state = { ...state, pending: [...state.pending, txn] }
      return txn
    },
    saveConfirmed: async (before, after, update) => {
      if (update.replaced || state.confirmed.seq === before.seq || state.confirmed.seq < after.seq)
        state = { ...state, confirmed: after }
      if (state.clientId === update.clientId)
        state = { ...state, pending: state.pending.filter(t => t.clientSeq > update.ackedClientSeq) }
    },
    resolveResend: async (id, resendFrom, newClientId) => {
      if (state.clientId !== id)
        return
      state = resolveResend(state, resendFrom, newClientId)
      lastClientSeq = state.pending.length
    },
    clear: async () => {
      state = createClientReplica(USER, clientId)
      lastClientSeq = 0
    },
  }
}

function fakeServer() {
  let log = createServerLog(USER)
  return {
    request: vi.fn(async (req: SyncRequest): Promise<SyncResponse> => {
      const appended = appendTransactions(log, req.transactions)
      log = appended.log
      return {
        ackedClientSeq: log.head.clientSeqs.get(req.clientId) ?? 0,
        resendFrom: appended.resendFrom,
        ...pullSince(log, req.afterSeq),
      }
    }),
    reset: () => {
      log = createServerLog(USER)
    },
  }
}

/** 一台设备：存储 + 内存里的已确认状态 + SyncEngine，与 GtdStore 的接法相同。 */
function makeDevice(server: ReturnType<typeof fakeServer>, clientId: string) {
  const storage = memoryStorage(clientId)
  let confirmed: ReplicaState = storage.replica().confirmed
  let queue: PendingQueue = { clientId, pending: [] }
  const engine = new SyncEngine({
    storage,
    request: req => server.request(req),
    getConfirmed: () => confirmed,
    onSynced: (next, q) => {
      confirmed = next
      queue = q
    },
    newClientId: () => `${clientId}-renewed`,
  })
  return {
    storage,
    engine,
    names: () => displayRows({ ...queue, confirmed })
      .flatMap(r => r.entity === 'task' ? [r.data.name] : [])
      .sort(),
    confirmed: () => confirmed,
    async edit(intents: LocalIntent[]) {
      const rows = displayRows({ clientId: queue.clientId, confirmed, pending: storage.replica().pending })
      const writes = emitWrites(rows, intents, USER)
      await storage.appendPending({ id: crypto.randomUUID(), clientTs: TS, writes })
      queue = await storage.loadPending()
    },
  }
}

function createTask(taskId: string, name = taskId): LocalIntent {
  return {
    kind: 'command',
    command: { id: crypto.randomUUID(), type: 'create_task', taskId, name, parentId: null, order: 0, mountDirId: null, clientTs: TS },
  }
}

describe('syncEngine', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    stubBrowserGlobals()
  })

  it('离线编辑后同步：事务被接受、出队，已确认状态包含它', async () => {
    const server = fakeServer()
    const a = makeDevice(server, 'A')
    await a.edit([createTask('t1', 'buy milk')])
    await a.engine.sync()

    expect(a.storage.replica().pending).toEqual([])
    expect(a.confirmed().seq).toBe(1)
    expect(a.names()).toEqual(['buy milk'])
    expect(a.engine.status).toBe('idle')
  })

  it('两台设备各自离线编辑，同步后结果一致', async () => {
    const server = fakeServer()
    const a = makeDevice(server, 'A')
    const b = makeDevice(server, 'B')
    await a.edit([createTask('t1', 'from A')])
    await b.edit([createTask('t2', 'from B')])
    await a.engine.sync()
    await b.engine.sync()
    await a.engine.sync()

    expect(a.names()).toEqual(['from A', 'from B'])
    expect(b.names()).toEqual(a.names())
  })

  it('同步进行中又有新编辑：本轮结束后自动再跑一轮', async () => {
    const server = fakeServer()
    const a = makeDevice(server, 'A')
    await a.edit([createTask('t1')])
    const original = server.request.getMockImplementation()!
    server.request.mockImplementationOnce(async (req) => {
      await a.edit([createTask('t2')])
      return original(req)
    })
    await a.engine.sync()

    expect(server.request).toHaveBeenCalledTimes(2)
    expect(a.storage.replica().pending).toEqual([])
    expect(a.names()).toEqual(['t1', 't2'])
  })

  it('服务器数据被重置：换成服务器快照，未确认事务换设备 id 重新编号后上传', async () => {
    const server = fakeServer()
    const a = makeDevice(server, 'A')
    await a.edit([createTask('t1', 'old')])
    await a.engine.sync()
    server.reset()
    await a.edit([createTask('t2', 'offline')])
    await a.engine.sync()

    expect(a.storage.replica().clientId).toBe('A-renewed')
    expect(a.storage.replica().pending).toEqual([])
    expect(a.names()).toEqual(['offline'])
  })

  it('离线时不发请求，状态为 offline', async () => {
    stubBrowserGlobals(false)
    const server = fakeServer()
    const a = makeDevice(server, 'A')
    await a.edit([createTask('t1')])
    await a.engine.sync()

    expect(server.request).not.toHaveBeenCalled()
    expect(a.engine.status).toBe('offline')
    expect(a.storage.replica().pending).toHaveLength(1)
  })

  it('请求失败：状态为 error，队列保留', async () => {
    const server = fakeServer()
    const a = makeDevice(server, 'A')
    await a.edit([createTask('t1')])
    server.request.mockRejectedValueOnce(new Error('network'))
    await a.engine.sync()

    expect(a.engine.status).toBe('error')
    expect(a.storage.replica().pending).toHaveLength(1)

    await a.engine.sync()
    expect(a.storage.replica().pending).toEqual([])
  })

  it('logout 清空本机副本', async () => {
    const server = fakeServer()
    const a = makeDevice(server, 'A')
    await a.edit([createTask('t1')])
    await a.engine.logout()

    expect(a.storage.replica().pending).toEqual([])
  })
})
