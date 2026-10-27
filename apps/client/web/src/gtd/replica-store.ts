/**
 * 设备侧副本的 IndexedDB 存储：已确认状态（rows + meta.state）与未确认事务队列（pending）。
 *
 * 同一浏览器的多个标签页共用一个设备 id 和一条 clientSeq 序列：分配号、换设备 id、确认后出队
 * 都在 IndexedDB 读写事务里完成，由 IndexedDB 在标签页之间串行化。
 * 已确认状态可能被另一个标签页抢先写到更新的进度，写入时据此决定增量、整体重写或跳过。
 */
import type { ClientReplica, ReplicaRow, ReplicaState, Transaction, Write } from '@agent/gtd'
import { emptyReplica, rowKey } from '@agent/gtd'

const DB_NAME = 'gtd-replica'
const DB_VERSION = 1
const ROWS = 'rows'
const PENDING = 'pending'
const META = 'meta'
const STATE_KEY = 'state'
const CLIENT_KEY = 'client'

interface StoredState {
  userId: string
  seq: number
  tombstones: string[]
  clientSeqs: Record<string, number>
}

interface StoredClient {
  clientId: string
  /** 这个设备 id 下分配过的最大 clientSeq；即使已确认状态回退也不会重复分配。 */
  lastClientSeq: number
}

export interface PendingQueue {
  clientId: string
  pending: Transaction[]
}

export interface ConfirmedUpdate {
  /** 服务器给了快照：已确认状态整体替换。 */
  replaced: boolean
  clientId: string
  ackedClientSeq: number
}

/** 副本存储接口；浏览器用 IndexedDB 实现，测试用内存实现。 */
export interface ReplicaStorage {
  /** 读出整个副本；存的是别的用户或空库时清空并新建设备 id。 */
  load: (userId: string) => Promise<ClientReplica>
  loadPending: () => Promise<PendingQueue>
  /** 给一次本地操作分配下一个 clientSeq 并入队。 */
  appendPending: (input: { id: string, clientTs: string, writes: Write[] }) => Promise<Transaction>
  /** 写入新的已确认状态，并把已被服务器接受的事务出队。before 是这次同步开始时的已确认状态。 */
  saveConfirmed: (before: ReplicaState, after: ReplicaState, update: ConfirmedUpdate) => Promise<void>
  /** 服务器要求从 resendFrom 重发而队列里没有那一号：换设备 id，队列从 1 重新编号。 */
  resolveResend: (clientId: string, resendFrom: number, newClientId: string) => Promise<void>
  clear: () => Promise<void>
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore(ROWS)
      db.createObjectStore(PENDING, { keyPath: 'clientSeq' })
      db.createObjectStore(META)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbPromise ??= openDB()
  return dbPromise
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 在一个 IndexedDB 事务里执行 body，事务提交后返回 body 的结果。 */
async function run<T>(
  stores: string[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const tx = (await db()).transaction(stores, mode)
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务中止'))
  })
  const result = await body(tx)
  await done
  return result
}

function toStoredState(state: ReplicaState): StoredState {
  return {
    userId: state.userId,
    seq: state.seq,
    tombstones: [...state.tombstones],
    clientSeqs: Object.fromEntries(state.clientSeqs),
  }
}

function newClient(): StoredClient {
  return { clientId: crypto.randomUUID(), lastClientSeq: 0 }
}

async function lastPendingSeq(store: IDBObjectStore): Promise<number> {
  const cursor = await request(store.openCursor(null, 'prev'))
  return cursor ? (cursor.value as Transaction).clientSeq : 0
}

export const idbReplicaStorage: ReplicaStorage = {
  async load(userId) {
    const loaded = await run([ROWS, PENDING, META], 'readonly', async (tx) => {
      const meta = tx.objectStore(META)
      const [state, client, rows, pending] = await Promise.all([
        request(meta.get(STATE_KEY)) as Promise<StoredState | undefined>,
        request(meta.get(CLIENT_KEY)) as Promise<StoredClient | undefined>,
        request(tx.objectStore(ROWS).getAll()) as Promise<ReplicaRow[]>,
        request(tx.objectStore(PENDING).getAll()) as Promise<Transaction[]>,
      ])
      return { state, client, rows, pending }
    })
    if (loaded.state?.userId === userId && loaded.client) {
      const { state, client } = loaded
      return {
        clientId: client.clientId,
        confirmed: {
          userId,
          seq: state.seq,
          rows: new Map(loaded.rows.map(r => [rowKey(r.entity, r.id), r])),
          tombstones: new Set(state.tombstones),
          clientSeqs: new Map(Object.entries(state.clientSeqs)),
        },
        pending: loaded.pending,
      }
    }

    const confirmed = emptyReplica(userId)
    const client = newClient()
    await run([ROWS, PENDING, META], 'readwrite', async (tx) => {
      tx.objectStore(ROWS).clear()
      tx.objectStore(PENDING).clear()
      tx.objectStore(META).put(toStoredState(confirmed), STATE_KEY)
      tx.objectStore(META).put(client, CLIENT_KEY)
    })
    return { clientId: client.clientId, confirmed, pending: [] }
  },

  loadPending() {
    return run([PENDING, META], 'readonly', async (tx) => {
      const [client, pending] = await Promise.all([
        request(tx.objectStore(META).get(CLIENT_KEY)) as Promise<StoredClient>,
        request(tx.objectStore(PENDING).getAll()) as Promise<Transaction[]>,
      ])
      return { clientId: client.clientId, pending }
    })
  },

  appendPending(input) {
    return run([PENDING, META], 'readwrite', async (tx) => {
      const meta = tx.objectStore(META)
      const pending = tx.objectStore(PENDING)
      const [client, state, last] = await Promise.all([
        request(meta.get(CLIENT_KEY)) as Promise<StoredClient>,
        request(meta.get(STATE_KEY)) as Promise<StoredState>,
        lastPendingSeq(pending),
      ])
      const acked = state.clientSeqs[client.clientId] ?? 0
      const clientSeq = Math.max(client.lastClientSeq, acked, last) + 1
      const txn: Transaction = { ...input, clientId: client.clientId, clientSeq }
      pending.add(txn)
      meta.put({ ...client, lastClientSeq: clientSeq } satisfies StoredClient, CLIENT_KEY)
      return txn
    })
  },

  saveConfirmed(before, after, update) {
    return run([ROWS, PENDING, META], 'readwrite', async (tx) => {
      const meta = tx.objectStore(META)
      const rows = tx.objectStore(ROWS)
      const [stored, client] = await Promise.all([
        request(meta.get(STATE_KEY)) as Promise<StoredState>,
        request(meta.get(CLIENT_KEY)) as Promise<StoredClient>,
      ])

      if (!update.replaced && stored.seq === before.seq) {
        for (const [key, row] of after.rows) {
          if (before.rows.get(key) !== row)
            rows.put(row, key)
        }
        for (const key of before.rows.keys()) {
          if (!after.rows.has(key))
            rows.delete(key)
        }
        meta.put(toStoredState(after), STATE_KEY)
      }
      else if (update.replaced || stored.seq < after.seq) {
        rows.clear()
        for (const [key, row] of after.rows)
          rows.put(row, key)
        meta.put(toStoredState(after), STATE_KEY)
      }

      if (client.clientId === update.clientId && update.ackedClientSeq > 0)
        tx.objectStore(PENDING).delete(IDBKeyRange.upperBound(update.ackedClientSeq))
    })
  },

  resolveResend(clientId, resendFrom, newClientId) {
    return run([PENDING, META], 'readwrite', async (tx) => {
      const meta = tx.objectStore(META)
      const store = tx.objectStore(PENDING)
      const [client, pending] = await Promise.all([
        request(meta.get(CLIENT_KEY)) as Promise<StoredClient>,
        request(store.getAll()) as Promise<Transaction[]>,
      ])
      if (client.clientId !== clientId || pending.some(t => t.clientSeq === resendFrom))
        return
      store.clear()
      pending.forEach((t, i) => store.add({ ...t, clientId: newClientId, clientSeq: i + 1 }))
      meta.put({ clientId: newClientId, lastClientSeq: pending.length } satisfies StoredClient, CLIENT_KEY)
    })
  },

  clear() {
    return run([ROWS, PENDING, META], 'readwrite', async (tx) => {
      tx.objectStore(ROWS).clear()
      tx.objectStore(PENDING).clear()
      tx.objectStore(META).clear()
    })
  },
}
