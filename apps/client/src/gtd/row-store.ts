/**
 * Client 本地行库（IndexedDB）。
 *
 * 三 object store：rows（key `${entity}:${id}`）、outbox（key id）、meta（key 'lastSyncId'）。
 * 本地 apply 复用 @agent/gtd 的 applyPush 同语义（数组 items：commands + mutations）。
 * persistAndQueue：rows + outbox 同一 readwrite 事务（同事务 persist，消除竞态）。
 * rebaseTransaction：push/pull 响应的 ack/nack + changes merge + lastSyncId 推进。
 */
import type { EntityRow, GtdCommand, GtdMutation, PushResponse } from '@agent/gtd'
import { applyPush, RowStore } from '@agent/gtd'

const DB_NAME = 'gtd-sync'
const DB_VERSION = 1
const ROWS_STORE = 'rows'
const OUTBOX_STORE = 'outbox'
const META_STORE = 'meta'

function rowKey(row: EntityRow): string {
  return `${row.entity}:${row.id}`
}

function isMutation(item: GtdMutation | GtdCommand): item is GtdMutation {
  return 'op' in item
}

/** 打开/升级 IndexedDB */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ROWS_STORE)) {
        db.createObjectStore(ROWS_STORE)
      }
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 读全部行（含软删） */
export async function loadRows(): Promise<EntityRow[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ROWS_STORE, 'readonly')
    const store = tx.objectStore(ROWS_STORE)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result as EntityRow[])
    req.onerror = () => reject(req.error)
  })
}

/** 读 outbox 全量 */
export async function loadOutbox(): Promise<Array<GtdMutation | GtdCommand>> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readonly')
    const req = tx.objectStore(OUTBOX_STORE).getAll()
    req.onsuccess = () => resolve(req.result as Array<GtdMutation | GtdCommand>)
    req.onerror = () => reject(req.error)
  })
}

/** 读 lastSyncId */
export async function loadLastSyncId(): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly')
    const req = tx.objectStore(META_STORE).get('lastSyncId')
    req.onsuccess = () => resolve((req.result as number) ?? 0)
    req.onerror = () => reject(req.error)
  })
}

/**
 * 本地乐观 apply（数组 items：commands + mutations）。
 * 复用 @agent/gtd 的 applyPush 同语义：commands 先于 mutations，每条独立 try/catch。
 * 返回新 rows + 新 clock + rejected（违规条目不 apply，调用方回滚）。
 */
export function applyLocal(
  rows: EntityRow[],
  userId: string,
  items: Array<GtdMutation | GtdCommand>,
  clock: number,
): { rows: EntityRow[], clock: number, rejected: PushResponse['rejected'] } {
  const mutations = items.filter(isMutation)
  const commands = items.filter((i): i is GtdCommand => !isMutation(i))
  const state = { userId, clock, rows, processedIds: new Set<string>() }
  const result = applyPush(state, { mutations, commands, lastSyncId: 0 })
  return { rows: result.state.rows, clock: result.state.clock, rejected: result.response.rejected }
}

/**
 * 同一 readwrite 事务内：persist changed rows + append outbox items（同事务 persist）。
 * 消除 rows 与 outbox 写入竞态；scheduleSync 应在此 resolve 后触发。
 */
export async function persistAndQueue(
  rows: EntityRow[],
  items: Array<GtdMutation | GtdCommand>,
): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([ROWS_STORE, OUTBOX_STORE], 'readwrite')
    const rowsStore = tx.objectStore(ROWS_STORE)
    const outboxStore = tx.objectStore(OUTBOX_STORE)
    for (const row of rows) {
      rowsStore.put(row, rowKey(row))
    }
    for (const item of items) {
      outboxStore.add(item)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * 内存合并远程 changes（push/pull 响应）：按 `entity:id` upsert changes 进 prevRows。
 * 供 SyncEngine onSynced 回调刷新内存 rowsAtom，免去全量 loadRows。
 */
export function mergeChanges(prevRows: EntityRow[], changes: EntityRow[]): EntityRow[] {
  if (changes.length === 0)
    return prevRows
  const map = new Map<string, EntityRow>()
  for (const r of prevRows)
    map.set(rowKey(r), r)
  for (const r of changes)
    map.set(rowKey(r), r)
  return [...map.values()]
}

/**
 * rebaseTransaction：push/pull 响应的本地善后。
 * 在同一 readwrite 事务内：ack applied / nack rejected / put changes / update lastSyncId。
 */
export async function rebaseTransaction(res: PushResponse): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([ROWS_STORE, OUTBOX_STORE, META_STORE], 'readwrite')
    const rowsStore = tx.objectStore(ROWS_STORE)
    const outboxStore = tx.objectStore(OUTBOX_STORE)
    const metaStore = tx.objectStore(META_STORE)

    // a. ack applied：从 outbox 删
    for (const id of res.applied) {
      outboxStore.delete(id)
    }
    // b. nack rejected：从 outbox 删（回滚由调用方处理乐观 UI）
    for (const { id } of res.rejected) {
      outboxStore.delete(id)
    }
    // c. put changes（含 deleted=true tombstone）
    for (const row of res.changes) {
      rowsStore.put(row, rowKey(row))
    }
    // d. meta.lastSyncId = serverSyncId
    metaStore.put(res.serverSyncId, 'lastSyncId')

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 持久化 rows（批量 put） */
export async function persistRows(rows: EntityRow[]): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ROWS_STORE, 'readwrite')
    const store = tx.objectStore(ROWS_STORE)
    for (const row of rows) {
      store.put(row, rowKey(row))
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 写 outbox（单条） */
export async function appendOutbox(item: GtdMutation | GtdCommand): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    tx.objectStore(OUTBOX_STORE).add(item)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 清空该用户全部本地数据（登出/换用户） */
export async function clearAll(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([ROWS_STORE, OUTBOX_STORE, META_STORE], 'readwrite')
    tx.objectStore(ROWS_STORE).clear()
    tx.objectStore(OUTBOX_STORE).clear()
    tx.objectStore(META_STORE).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 从本地行构造 RowStore（供 UI 派生/渲染） */
export function toRowStore(rows: EntityRow[]): RowStore {
  return new RowStore(rows)
}
