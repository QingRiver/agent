import type {
  EntityRow,
  EntityRowOf,
  ForecastSignalOptions,
  ForecastStripKey,
  GroupType,
  GtdCommand,
  GtdDocument,
  GtdMutation,
  Perspective,
  PerspectiveInput,
  RepeatRule,
  SyncEntity,
  Tag,
  Task,
} from '@agent/gtd'
import type { SyncStatus } from '../gtd/sync-engine'
import {
  AVAILABILITY_FILTER,
  builtinPerspectives,
  DEFAULT_FORECAST_SIGNALS,
  DEFAULT_FORECAST_STRIP,
  dematerialize,
  EXPLICIT_STATUS,
  FILTER_FIELD,
  FORECAST_STRIP_ORDER,
  GROUP_TYPE,
  LEAF_OP,
  materialize,
  normalizeDeferDue,
  orderBetween,
  parse,
  PLANNED_MODE,
  reindexSiblings,
  REPEAT_ANCHOR,
  RowStore,
  serialize,
  shouldReindex,
  shouldStop,
  SORT_DIR,
  SORT_FIELD,
  validateInvariants,
  validatePerspectiveInput,
} from '@agent/gtd'
import { GtdApi } from '@apis/gtd-api'
import { atom, getDefaultStore } from 'jotai'
import { isContiguousStripSelection, toggleForecastStrip } from '../gtd/forecast-strip'
import { applyLocal as applyRows, loadRows, mergeChanges, persistAndQueue } from '../gtd/row-store'
import { SyncEngine } from '../gtd/sync-engine'
import { DirStore } from './dir-store'

const DUE_SOON_MS = 2 * 24 * 60 * 60 * 1000
const LS_SELECTION = 'gtd.selection'
const LS_FORECAST_STRIP = 'gtd.forecastStrip'
const LS_FORECAST_SIGNALS = 'gtd.forecastSignals'

// ---------------- mutation/command 构造小工具 ----------------

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

function upsertMut(entity: SyncEntity, entityId: string, patch: Record<string, unknown>): GtdMutation {
  return { id: newId(), entity, entityId, op: 'upsert', patch, clientTs: nowIso() } as GtdMutation
}

function deleteMut(entity: SyncEntity, entityId: string): GtdMutation {
  return { id: newId(), entity, entityId, op: 'delete', clientTs: nowIso() } as GtdMutation
}

// command 构造：输入为分支字段（type/taskId/payload/...），自动补 id+clientTs。
// 用 Record 入参 + GtdCommand 出参，避开 Omit<discriminated-union> 丢变体字段。
function cmd(c: Record<string, unknown>): GtdCommand {
  return { ...c, id: newId(), clientTs: nowIso() } as GtdCommand
}

// ---------------- 顺序工具 ----------------

function nextOrder(items: Array<{ order: number }>): number {
  if (items.length === 0)
    return 0
  return Math.max(...items.map(i => i.order)) + 1
}

function sortedByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order)
}

function targetOrder<T extends { id: string, order: number }>(
  siblings: T[],
  beforeId: string | null,
  afterId: string | null,
): { order: number, reindexed: Map<string, number> } {
  const before = beforeId ? siblings.find(item => item.id === beforeId) : null
  const after = afterId ? siblings.find(item => item.id === afterId) : null
  if (beforeId && !before)
    throw new Error(`找不到前一个同级项 ${beforeId}`)
  if (afterId && !after)
    throw new Error(`找不到后一个同级项 ${afterId}`)
  if (before && after && shouldReindex(before.order, after.order)) {
    const reindexed = reindexSiblings(siblings)
    return {
      order: orderBetween(reindexed.get(before.id)!, reindexed.get(after.id)!),
      reindexed,
    }
  }
  return {
    order: orderBetween(before?.order ?? null, after?.order ?? null),
    reindexed: new Map(),
  }
}

// ---------------- 选择 ----------------

export type GtdSelection
  = | { kind: 'perspective', id: string }
    | { kind: 'project', id: string }
    | { kind: 'tag', id: string }
    | { kind: 'folder', id: string }

export type RepeatRuleInput = Omit<RepeatRule, 'id' | 'completedOccurrences'>

function readSelection(): GtdSelection {
  try {
    const raw = localStorage.getItem(LS_SELECTION)
    if (!raw)
      return { kind: 'perspective', id: 'forecast' }
    const parsed = JSON.parse(raw) as GtdSelection
    if (parsed && typeof parsed === 'object' && 'kind' in parsed && 'id' in parsed)
      return parsed
  }
  catch {
    // ignore
  }
  return { kind: 'perspective', id: 'forecast' }
}

function writeSelection(sel: GtdSelection): void {
  try {
    localStorage.setItem(LS_SELECTION, JSON.stringify(sel))
  }
  catch {
    // ignore
  }
}

function readForecastStrip(): ForecastStripKey[] {
  try {
    const raw = localStorage.getItem(LS_FORECAST_STRIP)
    if (!raw)
      return [...DEFAULT_FORECAST_STRIP]
    const parsed = JSON.parse(raw) as ForecastStripKey[]
    const allowed = new Set(FORECAST_STRIP_ORDER)
    if (
      Array.isArray(parsed)
      && parsed.length > 0
      && parsed.every(k => allowed.has(k as typeof FORECAST_STRIP_ORDER[number]))
      && isContiguousStripSelection(parsed)
    ) {
      return parsed
    }
  }
  catch {
    // ignore
  }
  return [...DEFAULT_FORECAST_STRIP]
}

function writeForecastStrip(strip: ForecastStripKey[]): void {
  try {
    localStorage.setItem(LS_FORECAST_STRIP, JSON.stringify(strip))
  }
  catch {
    // ignore
  }
}

function readForecastSignals(): ForecastSignalOptions {
  try {
    const raw = localStorage.getItem(LS_FORECAST_SIGNALS)
    if (!raw)
      return { ...DEFAULT_FORECAST_SIGNALS }
    const parsed = JSON.parse(raw) as Partial<ForecastSignalOptions>
    return { ...DEFAULT_FORECAST_SIGNALS, ...parsed }
  }
  catch {
    // ignore
  }
  return { ...DEFAULT_FORECAST_SIGNALS }
}

function writeForecastSignals(signals: ForecastSignalOptions): void {
  try {
    localStorage.setItem(LS_FORECAST_SIGNALS, JSON.stringify(signals))
  }
  catch {
    // ignore
  }
}

/** 透视校验上下文：projects/folders 来自 dirs 树（Phase 1 统一树），tags 来自 RowStore */
function perspectiveValidationContext(
  store: RowStore,
  dirs: { projects: { id: string, name: string }[], folders: { id: string, name: string, parentId: string | null }[] },
) {
  return {
    now: new Date(),
    timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
    projects: dirs.projects,
    folders: dirs.folders,
    tags: store.liveTags().map(t => ({ id: t.id, name: t.data.name })),
    builtinPerspectiveIds: builtinPerspectives().map(p => p.id),
  }
}

/** 按 selection 解析用于渲染的 Perspective（内置或临时过滤） */
export function resolvePerspective(store: RowStore, selection: GtdSelection): Perspective {
  if (selection.kind === 'perspective') {
    const builtin = builtinPerspectives().find(p => p.id === selection.id)
    if (builtin)
      return builtin
    const row = store.livePerspectives().find(p => p.id === selection.id)
    if (row)
      return { id: row.id, ...row.data }
    return builtinPerspectives()[0]!
  }
  if (selection.kind === 'project') {
    return {
      id: `project:${selection.id}`,
      name: '项目',
      icon: null,
      filter: { op: LEAF_OP.SOME, field: FILTER_FIELD.PROJECT, value: [selection.id] },
      groupBy: [],
      sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
      availabilityFilter: AVAILABILITY_FILTER.REMAINING,
      showCompleted: false,
      showDropped: false,
      flaggedOnly: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: null,
    }
  }
  if (selection.kind === 'tag') {
    return {
      id: `tag:${selection.id}`,
      name: '标签',
      icon: null,
      filter: { op: LEAF_OP.SOME, field: FILTER_FIELD.TAG, value: [selection.id] },
      groupBy: [],
      sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
      availabilityFilter: AVAILABILITY_FILTER.REMAINING,
      showCompleted: false,
      showDropped: false,
      flaggedOnly: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: null,
    }
  }
  // folder：显示该 folder 下所有 project 的任务
  return {
    id: `folder:${selection.id}`,
    name: '文件夹',
    icon: null,
    filter: { op: LEAF_OP.SOME, field: FILTER_FIELD.FOLDER, value: [selection.id] },
    groupBy: [],
    sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
    availabilityFilter: AVAILABILITY_FILTER.REMAINING,
    showCompleted: false,
    showDropped: false,
    flaggedOnly: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: null,
  }
}

// ---------------- row 形状小工具 ----------------

function tShape(s: EntityRowOf<'task'>) {
  return { id: s.id, ...s.data }
}

/**
 * 重排 dir 同级（fractional order）：按 parentId 过滤同级 → targetOrder 算新 sortOrder +
 * 受影响兄弟 → DirStore.reorderBatch 单次落库。project 根（parentId=null）与 dir 子节点统一走此。
 */
async function reorderDirSibling(
  id: string,
  target: { beforeId: string | null, afterId: string | null },
  parentId: string | null,
): Promise<void> {
  const dirs = getDefaultStore().get(DirStore.dirsAtom)
  const siblings = dirs
    .filter(d => d.id !== id && d.parentId === parentId)
    .map(d => ({ id: d.id, order: d.sortOrder }))
  const result = targetOrder(siblings, target.beforeId, target.afterId)
  const updates: { id: string, sortOrder: number }[] = [{ id, sortOrder: result.order }]
  for (const sib of siblings) {
    const order = result.reindexed.get(sib.id)
    if (order != null)
      updates.push({ id: sib.id, sortOrder: order })
  }
  await DirStore.reorderBatch(updates)
}

// ---------------- Store ----------------

/** SyncEngine 单例（无头守护进程） */
let syncEngine: SyncEngine | null = null

function getSyncEngine(): SyncEngine {
  if (!syncEngine) {
    syncEngine = new SyncEngine({
      push: body => GtdApi.syncPush(body),
      pull: body => GtdApi.syncPull(body),
    })
  }
  return syncEngine
}

function maxSyncId(rows: EntityRow[]): number {
  let m = 0
  for (const r of rows) {
    if (r.syncId > m)
      m = r.syncId
  }
  return m
}

export class GtdStore {
  static readonly userIdAtom = atom<string | undefined>(undefined)
  static readonly rowsAtom = atom<EntityRow[]>([])
  static readonly rowStoreAtom = atom((get) => {
    // 注入 dirs 派生投影：projectOf（walkToProjectRoot）+ isDirMount（FOLDER 改义）。
    // 捕获 dirsById 值（非 get），rowStoreAtom 依赖 dirsAtom → dirs 变即重算 RowStore。
    const dirsById = get(DirStore.dirsByIdAtom)
    return new RowStore(get(GtdStore.rowsAtom), {
      projectOf: task => DirStore.projectOf(dirsById, task.data.mountDirId),
      isDirMount: task => DirStore.isDirMount(dirsById, task.data.mountDirId),
    })
  })

  static readonly selectionAtom = atom<GtdSelection>(readSelection())
  static readonly forecastStripAtom = atom<ForecastStripKey[]>(readForecastStrip())
  static readonly forecastSignalsAtom = atom<ForecastSignalOptions>(readForecastSignals())
  static readonly selectedTaskIdAtom = atom<string | null>(null)
  static readonly selectedProjectIdAtom = atom<string | null>(null)
  static readonly isLoadingAtom = atom(false)
  static readonly syncStatusAtom = atom<SyncStatus>('idle')
  static readonly savingAtom = atom(get => get(GtdStore.syncStatusAtom) === 'syncing')
  static readonly syncLockedAtom = atom(false)
  static readonly errorAtom = atom<string | null>(null)
  static readonly dueSoonMs = DUE_SOON_MS

  private static loadGeneration = 0

  private static store() {
    return getDefaultStore()
  }

  static async onUserIdChange(userId: string | undefined): Promise<void> {
    const s = GtdStore.store()
    const prev = s.get(GtdStore.userIdAtom)
    if (prev === userId)
      return
    s.set(GtdStore.userIdAtom, userId)
    if (!userId) {
      // 登出：stopDaemons + 清空 IDB + 清空 rows
      const engine = getSyncEngine()
      await engine.logout()
      s.set(GtdStore.rowsAtom, [])
      s.set(GtdStore.selectedTaskIdAtom, null)
      s.set(GtdStore.selectedProjectIdAtom, null)
      s.set(GtdStore.errorAtom, null)
      return
    }
    await GtdStore.load()
  }

  static async load(): Promise<void> {
    const s = GtdStore.store()
    const gen = ++GtdStore.loadGeneration
    s.set(GtdStore.isLoadingAtom, true)
    s.set(GtdStore.errorAtom, null)
    try {
      // 先读本地行库 → rows
      const rows = await loadRows()
      if (gen === GtdStore.loadGeneration)
        s.set(GtdStore.rowsAtom, rows)
      // syncEngine 启动 + 注册 onSynced（背景 pull/push 后以服务端权威 changes 刷内存）
      const engine = getSyncEngine()
      engine.setStatusListener(status => s.set(GtdStore.syncStatusAtom, status))
      engine.setRejectedListener((rejected) => {
        // reject 锁前端（不做乐观行回滚），用户点「恢复」→ clear 本地 + pull 服务端
        s.set(GtdStore.syncLockedAtom, true)
        s.set(GtdStore.errorAtom, rejected.map(r => r.reason).join('; '))
      })
      engine.setSyncedListener((changes) => {
        if (gen !== GtdStore.loadGeneration)
          return
        s.set(GtdStore.rowsAtom, mergeChanges(s.get(GtdStore.rowsAtom), changes))
      })
      await engine.bootstrap()
      // sync 后兜底再读一次行（onSynced 已刷，此处保证 bootstrap 空库灌行后落地）
      const updatedRows = await loadRows()
      if (gen === GtdStore.loadGeneration)
        s.set(GtdStore.rowsAtom, updatedRows)
    }
    catch (e) {
      if (gen !== GtdStore.loadGeneration)
        return
      s.set(GtdStore.errorAtom, e instanceof Error ? e.message : String(e))
    }
    finally {
      if (gen === GtdStore.loadGeneration)
        s.set(GtdStore.isLoadingAtom, false)
    }
  }

  static setSelection(sel: GtdSelection): void {
    const s = GtdStore.store()
    s.set(GtdStore.selectionAtom, sel)
    writeSelection(sel)
    s.set(GtdStore.selectedTaskIdAtom, null)
    if (sel.kind === 'project')
      s.set(GtdStore.selectedProjectIdAtom, sel.id)
    else
      s.set(GtdStore.selectedProjectIdAtom, null)
  }

  /** 五段条点击：连续多选扩展/端点收缩 */
  static toggleForecastStripSegment(clicked: ForecastStripKey): void {
    const s = GtdStore.store()
    const next = toggleForecastStrip(s.get(GtdStore.forecastStripAtom), clicked)
    s.set(GtdStore.forecastStripAtom, next)
    writeForecastStrip(next)
  }

  static patchForecastSignals(patch: Partial<ForecastSignalOptions>): void {
    const s = GtdStore.store()
    const next = { ...s.get(GtdStore.forecastSignalsAtom), ...patch }
    s.set(GtdStore.forecastSignalsAtom, next)
    writeForecastSignals(next)
  }

  /** Planned：none / rolling / on(+date) */
  static setTaskPlanned(
    taskId: string,
    mode: typeof PLANNED_MODE[keyof typeof PLANNED_MODE],
    date: string | null = null,
  ): void {
    if (mode === PLANNED_MODE.ON) {
      GtdStore.patchTask(taskId, { plannedMode: mode, plannedDate: date })
      return
    }
    GtdStore.patchTask(taskId, { plannedMode: mode, plannedDate: null })
  }

  static selectTask(taskId: string | null): void {
    GtdStore.store().set(GtdStore.selectedTaskIdAtom, taskId)
    if (taskId)
      GtdStore.store().set(GtdStore.selectedProjectIdAtom, null)
  }

  static selectProjectForInspector(projectId: string | null): void {
    GtdStore.store().set(GtdStore.selectedProjectIdAtom, projectId)
    if (projectId)
      GtdStore.store().set(GtdStore.selectedTaskIdAtom, null)
  }

  /**
   * 本地变更 → 校验 → 行级 apply（复用 applyPush 同语义）→ 同事务 persist rows+outbox → scheduleSync。
   * 真相是 rowsAtom；UI 经 rowStoreAtom 派生刷新。build 在当前 store 上显式产 mutation/command。
   */
  private static applyLocal(build: (store: RowStore) => Array<GtdMutation | GtdCommand>): boolean {
    const s = GtdStore.store()
    // reject 锁定期拒绝一切本地编辑，直到用户点「恢复」
    if (s.get(GtdStore.syncLockedAtom)) {
      s.set(GtdStore.errorAtom, '同步冲突已锁定编辑，请点击「恢复」重拉服务端数据')
      return false
    }
    const userId = s.get(GtdStore.userIdAtom) ?? 'u1'
    const prevRows = s.get(GtdStore.rowsAtom)
    const store = new RowStore(prevRows)

    let items: Array<GtdMutation | GtdCommand>
    try {
      items = build(store)
    }
    catch (e) {
      s.set(GtdStore.errorAtom, e instanceof Error ? e.message : String(e))
      return false
    }
    if (items.length === 0)
      return false

    const prevClock = maxSyncId(prevRows)
    const { rows: nextRows, rejected } = applyRows(prevRows, userId, items, prevClock)
    if (rejected.length) {
      s.set(GtdStore.errorAtom, rejected.map(r => r.reason).join('; '))
      return false
    }
    const violations = validateInvariants(new RowStore(nextRows))
    if (violations.length > 0) {
      s.set(GtdStore.errorAtom, violations.map(v => v.message).join('; '))
      return false
    }
    s.set(GtdStore.rowsAtom, nextRows)
    s.set(GtdStore.errorAtom, null)
    // 只 persist 改动行（未改行 syncId 不动，不覆写服务端 syncId）
    // rows + outbox 同一 IDB 事务，完成后才 scheduleSync
    const changed = nextRows.filter(r => r.syncId > prevClock)
    void persistAndQueue(changed, items).then(() => getSyncEngine().scheduleSync())
    return true
  }

  static async flushSave(): Promise<void> {
    await getSyncEngine().sync()
  }

  /**
   * 恢复：reject 锁定后用户点「恢复」→ 清空本地行库（rows/outbox/meta）+ 重新 pull 服务端。
   * 不做乐观行回滚（不划算）；直接以服务端为准重拉。
   */
  static async recoverFromReject(): Promise<void> {
    const s = GtdStore.store()
    const engine = getSyncEngine()
    await engine.logout() // stopDaemons + clearAll（清 IDB rows/outbox/meta）
    s.set(GtdStore.syncLockedAtom, false)
    s.set(GtdStore.errorAtom, null)
    s.set(GtdStore.rowsAtom, [])
    await GtdStore.load() // bootstrap sync() → pull(0) 灌服务端最新
  }

  // ---------- Tasks ----------

  static addInboxTask(name: string): void {
    const trimmed = name.trim()
    if (!trimmed)
      return
    GtdStore.applyLocal((store) => {
      const now = nowIso()
      const id = newId()
      const data = {
        name: trimmed,
        note: null,
        mountDirId: null,
        parentId: null,
        order: nextOrder(store.liveTasks().filter(t => t.data.mountDirId == null && t.data.parentId == null).map(tShape)),
        status: EXPLICIT_STATUS.ACTIVE,
        groupType: null,
        deferDate: null,
        dueDate: null,
        plannedMode: PLANNED_MODE.NONE,
        plannedDate: null,
        completedAt: null,
        droppedAt: null,
        flagged: false,
        estimateMinutes: null,
        repeatRuleId: null,
        repeatedFromTaskId: null,
        createdAt: now,
        updatedAt: now,
        repeatRule: null,
      }
      return [upsertMut('task', id, data)]
    })
  }

  static addProjectTask(projectId: string, name: string): void {
    const trimmed = name.trim()
    if (!trimmed)
      return
    GtdStore.applyLocal((store) => {
      const now = nowIso()
      const id = newId()
      const siblings = store.liveTasks().filter(t => t.data.mountDirId === projectId && t.data.parentId == null).map(tShape)
      const data = {
        name: trimmed,
        note: null,
        mountDirId: projectId,
        parentId: null,
        order: nextOrder(siblings),
        status: EXPLICIT_STATUS.ACTIVE,
        groupType: null,
        deferDate: null,
        dueDate: null,
        plannedMode: PLANNED_MODE.NONE,
        plannedDate: null,
        completedAt: null,
        droppedAt: null,
        flagged: false,
        estimateMinutes: null,
        repeatRuleId: null,
        repeatedFromTaskId: null,
        createdAt: now,
        updatedAt: now,
        repeatRule: null,
      }
      return [upsertMut('task', id, data)]
    })
  }

  static addChildTask(parentId: string, name: string): void {
    const trimmed = name.trim()
    if (!trimmed)
      return
    GtdStore.applyLocal((store) => {
      const parent = store.findLive('task', parentId)
      if (!parent)
        throw new Error('父任务不存在')
      if (!parent.data.mountDirId)
        throw new Error('Inbox 任务需先移入项目，才能添加子任务')
      const now = nowIso()
      const id = newId()
      const children = store.liveTasks().filter(t => t.data.parentId === parentId).map(tShape)
      const data = {
        name: trimmed,
        note: null,
        mountDirId: parent.data.mountDirId,
        parentId,
        order: nextOrder(children),
        status: EXPLICIT_STATUS.ACTIVE,
        groupType: null,
        deferDate: null,
        dueDate: null,
        plannedMode: PLANNED_MODE.NONE,
        plannedDate: null,
        completedAt: null,
        droppedAt: null,
        flagged: false,
        estimateMinutes: null,
        repeatRuleId: null,
        repeatedFromTaskId: null,
        createdAt: now,
        updatedAt: now,
        repeatRule: null,
      }
      const items: Array<GtdMutation | GtdCommand> = [upsertMut('task', id, data)]
      if (!parent.data.groupType)
        items.push(upsertMut('task', parentId, { groupType: GROUP_TYPE.PARALLEL, updatedAt: now }))
      return items
    })
  }

  static indentTask(taskId: string): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      if (!task.data.mountDirId)
        throw new Error('Inbox 任务不能缩进')
      const siblings = sortedByOrder(store.liveTasks().filter(t =>
        t.data.mountDirId === task.data.mountDirId && t.data.parentId === task.data.parentId,
      ).map(tShape))
      const index = siblings.findIndex(t => t.id === taskId)
      const parent = index > 0 ? siblings[index - 1]! : null
      if (!parent)
        throw new Error('当前任务前面没有可作为父级的任务')
      const now = nowIso()
      const children = store.liveTasks().filter(t => t.data.parentId === parent.id && t.id !== taskId).map(tShape)
      // task 移动走 upsert patch（move command 已删）；mountDirId 不变（同 project 内缩进）
      const items: GtdMutation[] = [
        upsertMut('task', taskId, { parentId: parent.id, order: nextOrder(children), updatedAt: now }),
      ]
      if (!parent.groupType)
        items.push(upsertMut('task', parent.id, { groupType: GROUP_TYPE.PARALLEL, updatedAt: now }))
      return items
    })
  }

  static outdentTask(taskId: string): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      const parentId = task.data.parentId
      const parent = parentId ? store.findLive('task', parentId) : null
      if (!task || !parent)
        throw new Error('当前任务已经是项目顶层任务')
      const parentSiblings = sortedByOrder(store.liveTasks().filter(t =>
        t.data.mountDirId === parent.data.mountDirId && t.data.parentId === parent.data.parentId && t.id !== taskId,
      ).map(tShape))
      const parentIndex = parentSiblings.findIndex(t => t.id === parent.id)
      const after = parentIndex >= 0 ? parentSiblings[parentIndex + 1] ?? null : null
      const remainingChildren = store.liveTasks().filter(t => t.data.parentId === parent.id && t.id !== taskId)
      const now = nowIso()
      const items: GtdMutation[] = [
        upsertMut('task', taskId, { parentId: parent.data.parentId, order: orderBetween(parent.data.order, after?.order ?? null), updatedAt: now }),
      ]
      if (remainingChildren.length === 0)
        items.push(upsertMut('task', parent.id, { groupType: null, updatedAt: now }))
      return items
    })
  }

  static setTaskGroupType(taskId: string, type: GroupType | null): void {
    GtdStore.applyLocal((store) => {
      const hasChildren = store.liveTasks().some(t => t.data.parentId === taskId)
      if (hasChildren && type == null)
        throw new Error('有子任务的任务组不能转换为普通任务')
      return [upsertMut('task', taskId, { groupType: type, updatedAt: nowIso() })]
    })
  }

  static reorderTask(
    taskId: string,
    target: { beforeId: string | null, afterId: string | null },
  ): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      const siblings = store.liveTasks().filter(t =>
        t.id !== taskId
        && t.data.mountDirId === task.data.mountDirId
        && t.data.parentId === task.data.parentId,
      ).map(tShape)
      const result = targetOrder(siblings, target.beforeId, target.afterId)
      const now = nowIso()
      const items: GtdMutation[] = [
        upsertMut('task', taskId, { parentId: task.data.parentId, order: result.order, updatedAt: now }),
      ]
      for (const sib of siblings) {
        const order = result.reindexed.get(sib.id)
        if (order != null)
          items.push(upsertMut('task', sib.id, { order, updatedAt: now }))
      }
      return items
    })
  }

  static completeTask(taskId: string): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      const rule = task.data.repeatRuleId != null ? task.data.repeatRule : undefined
      const willClone = task.data.repeatRuleId != null && rule != null && !shouldStop(rule, new Date())
      return [
        willClone
          ? cmd({ type: 'complete', taskId, clientGenerated: { nextTaskId: newId() } })
          : cmd({ type: 'complete', taskId }),
      ]
    })
  }

  static dropTask(taskId: string): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      return [cmd({ type: 'drop', taskId })]
    })
  }

  static reopenTask(taskId: string): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      return [upsertMut('task', taskId, { status: EXPLICIT_STATUS.ACTIVE, completedAt: null, updatedAt: nowIso() })]
    })
  }

  static restoreTask(taskId: string): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      return [upsertMut('task', taskId, { status: EXPLICIT_STATUS.ACTIVE, droppedAt: null, updatedAt: nowIso() })]
    })
  }

  static deleteTaskLogical(taskId: string): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      const now = nowIso()
      return [upsertMut('task', taskId, { status: EXPLICIT_STATUS.DELETED, droppedAt: now, updatedAt: now })]
    })
  }

  static toggleFlag(taskId: string): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      return [upsertMut('task', taskId, { flagged: !task.data.flagged, updatedAt: nowIso() })]
    })
  }

  static patchTask(taskId: string, patch: Partial<Task>): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      const rule = task.data.repeatRuleId != null ? task.data.repeatRule : null
      if (rule?.anchor === REPEAT_ANCHOR.DUE && patch.dueDate === null)
        throw new Error('按截止日重复的任务不能清空截止日期')
      if (rule?.anchor === REPEAT_ANCHOR.DEFER && patch.deferDate === null)
        throw new Error('按推迟日重复的任务不能清空推迟日期')
      // 行模型 task 无 tagIds/attachmentIds；repeatRule/repeatRuleId 由 setTaskRepeat 维护
      const { id: _id, tagIds: _t, attachmentIds: _a, repeatRuleId: _rid, ...rest } = patch
      const datePatch: { deferDate?: string | null, dueDate?: string | null } = {}
      if (Object.hasOwn(patch, 'deferDate'))
        datePatch.deferDate = patch.deferDate ?? null
      if (Object.hasOwn(patch, 'dueDate'))
        datePatch.dueDate = patch.dueDate ?? null
      const dates = Object.keys(datePatch).length > 0
        ? normalizeDeferDue(
            { deferDate: task.data.deferDate, dueDate: task.data.dueDate },
            datePatch,
          )
        : null
      return [upsertMut('task', taskId, {
        ...rest,
        ...(dates ?? {}),
        updatedAt: nowIso(),
      })]
    })
  }

  static setTaskRepeat(taskId: string, input: RepeatRuleInput | null): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      if (input?.anchor === REPEAT_ANCHOR.DUE && !task.data.dueDate)
        throw new Error('按截止日重复前，请先设置截止日期')
      if (input?.anchor === REPEAT_ANCHOR.DEFER && !task.data.deferDate)
        throw new Error('按推迟日重复前，请先设置推迟日期')
      const now = nowIso()
      if (!input) {
        return [upsertMut('task', taskId, { repeatRuleId: null, repeatRule: null, updatedAt: now })]
      }
      const existing = task.data.repeatRule
      const shared = existing
        ? store.liveTasks().some(t => t.id !== taskId && t.data.repeatRuleId === existing.id)
        : false
      const id = existing && !shared ? existing.id : newId()
      const rule: RepeatRule = {
        ...input,
        id,
        completedOccurrences: existing?.completedOccurrences ?? 0,
      }
      return [upsertMut('task', taskId, { repeatRuleId: id, repeatRule: rule, updatedAt: now })]
    })
  }

  /** 设置任务的标签集合：diff 出 add/remove 的 task_tag 行（行模型 tagIds 不在 task 字段，走独立行） */
  static setTaskTags(taskId: string, tagIds: string[]): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      const current = store.tagIdsOf(taskId)
      const next = new Set(tagIds)
      const items: GtdMutation[] = []
      for (const tagId of tagIds) {
        if (!current.includes(tagId))
          items.push(upsertMut('task_tag', `${taskId}|${tagId}`, { taskId, tagId }))
      }
      for (const tagId of current) {
        if (!next.has(tagId))
          items.push(deleteMut('task_tag', `${taskId}|${tagId}`))
      }
      return items
    })
  }

  // ---------- Perspectives ----------

  static addPerspective(input: PerspectiveInput): boolean {
    const dirs = GtdStore.store().get(DirStore.validationRefsAtom)
    return GtdStore.applyLocal((store) => {
      const result = validatePerspectiveInput(
        input,
        perspectiveValidationContext(store, dirs),
        { mode: 'persist' },
      )
      if (!result.ok)
        throw new Error(result.errors.map(error => error.message).join('; '))
      const now = nowIso()
      const id = newId()
      const data = {
        name: result.value.name!,
        icon: result.value.icon ?? null,
        filter: result.value.filter,
        groupBy: result.value.groupBy,
        sortBy: result.value.sortBy,
        availabilityFilter: result.value.availabilityFilter,
        showCompleted: result.value.showCompleted,
        showDropped: result.value.showDropped,
        flaggedOnly: result.value.flaggedOnly,
        createdAt: now,
        updatedAt: null,
      }
      return [upsertMut('perspective', id, data)]
    })
  }

  static patchPerspective(id: string, input: PerspectiveInput): boolean {
    const dirs = GtdStore.store().get(DirStore.validationRefsAtom)
    return GtdStore.applyLocal((store) => {
      if (!store.livePerspectives().some(p => p.id === id))
        throw new Error('自定义透视不存在')
      const result = validatePerspectiveInput(
        input,
        perspectiveValidationContext(store, dirs),
        { mode: 'persist', perspectiveId: id },
      )
      if (!result.ok)
        throw new Error(result.errors.map(error => error.message).join('; '))
      return [upsertMut('perspective', id, {
        name: result.value.name!,
        icon: result.value.icon ?? null,
        filter: result.value.filter,
        groupBy: result.value.groupBy,
        sortBy: result.value.sortBy,
        availabilityFilter: result.value.availabilityFilter,
        showCompleted: result.value.showCompleted,
        showDropped: result.value.showDropped,
        flaggedOnly: result.value.flaggedOnly,
        updatedAt: nowIso(),
      })]
    })
  }

  static removePerspective(id: string): void {
    const s = GtdStore.store()
    GtdStore.applyLocal(() => [deleteMut('perspective', id)])
    const selection = s.get(GtdStore.selectionAtom)
    if (selection.kind === 'perspective' && selection.id === id)
      GtdStore.setSelection({ kind: 'perspective', id: 'forecast' })
  }

  // ---------- Projects / Dirs（在线 Dir API，project=根=纯命名作用域） ----------
  // Phase 1：project/folder 退出 sync，CRUD 走 DirStore（DirApi）。project facet 全弃用
  // （type/status/review/default_*/flagged/note 删）；project 仅剩 name（rename）。

  /** 创建 project 根（kind=project，parentId=null） */
  static async addProject(name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed)
      return
    await DirStore.createProject(trimmed)
  }

  /** 改名（project/dir 统一走 DirApi.rename） */
  static async renameDir(id: string, name: string): Promise<void> {
    await DirStore.rename(id, name.trim())
  }

  /** 删 dir/project（须空：无子 dir + 无挂载 task；v1 不级联） */
  static async removeProject(id: string): Promise<void> {
    await DirStore.delete(id)
  }

  /** 移动 dir 到新父（跨 project 级联子树 dirs + task projectId） */
  static async moveDir(id: string, newParentId: string, sortOrder?: number): Promise<void> {
    await DirStore.move(id, newParentId, sortOrder)
  }

  static async reorderProject(
    id: string,
    target: { beforeId: string | null, afterId: string | null },
  ): Promise<void> {
    await reorderDirSibling(id, target, null)
  }

  // ---------- Tags ----------

  static addTag(name: string): void {
    const trimmed = name.trim()
    if (!trimmed)
      return
    GtdStore.applyLocal(() => {
      const now = nowIso()
      const id = newId()
      const data = {
        name: trimmed,
        color: null,
        createdAt: now,
        updatedAt: null,
      }
      return [upsertMut('tag', id, data)]
    })
  }

  static patchTag(tagId: string, patch: Partial<Tag>): void {
    GtdStore.applyLocal(() => {
      const { id: _id, ...rest } = patch
      return [upsertMut('tag', tagId, { ...rest, updatedAt: nowIso() })]
    })
  }

  static removeTag(tagId: string): void {
    GtdStore.applyLocal(() => {
      // Phase 1：project defaultTagIds 已弃用（facet 全删），仅删 tag
      const items: Array<GtdMutation | GtdCommand> = [cmd({ type: 'delete_tag', payload: { tagId } })]
      return items
    })
  }

  // ---------- Dirs（folder 退出 sync，dir 子节点走 Dir API） ----------

  /** 创建 dir 子节点（kind=dir，须有 parent） */
  static async addFolder(name: string, parentId: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed)
      return
    await DirStore.createDir(parentId, trimmed)
  }

  static async reorderFolder(
    id: string,
    target: { beforeId: string | null, afterId: string | null },
  ): Promise<void> {
    // folder=dir：需查其 parentId 定位同级。reorderDirSibling 内部按 parentId 过滤同级。
    const dir = GtdStore.store().get(DirStore.dirsByIdAtom).get(id)
    await reorderDirSibling(id, target, dir?.parentId ?? null)
  }

  static async removeFolder(id: string): Promise<void> {
    await DirStore.delete(id)
  }

  // ---------- 导入 / 导出 ----------

  /** 导出：rows → materialize → GtdDocument → JSON 字符串（走最新读接口，非脏快照） */
  static exportDocument(): string {
    const s = GtdStore.store()
    const rows = s.get(GtdStore.rowsAtom)
    return serialize(materialize(rows))
  }

  /**
   * 导入：JSON → parse → remap 全部 id 为新 uuid（仅新建，禁止覆盖）→ dematerialize →
   * 按 ref 安全顺序（folders/projects/tags/perspectives/attachments/tasks 父先子后/task_tag）
   * 批量 upsert mutation → applyLocal → push。不做冲突逐条决议 UI（简单版：全量 remap）。
   */
  static importDocument(json: string): boolean {
    const s = GtdStore.store()
    const userId = s.get(GtdStore.userIdAtom) ?? 'u1'
    let doc: GtdDocument
    try {
      doc = parse(json)
    }
    catch (e) {
      s.set(GtdStore.errorAtom, `导入失败：${e instanceof Error ? e.message : String(e)}`)
      return false
    }
    const remapped = remapDocIds(doc)
    const rows = dematerialize(remapped, userId)
    const ordered = orderImportRows(rows)
    const items = ordered.map(r => upsertMut(r.entity, r.id, r.data as Record<string, unknown>))
    return GtdStore.applyLocal(() => items)
  }
}

// ---------------- 导入辅助 ----------------

/** remap doc 全部实体 id 为新 uuid，并重建引用（projectId/parentId/folderId/tagIds/repeatRuleId/repeatedFromTaskId/taskId） */
function remapDocIds(doc: GtdDocument): GtdDocument {
  const idMap = new Map<string, string>()
  const remap = (id: string): string => {
    let n = idMap.get(id)
    if (!n) {
      n = crypto.randomUUID()
      idMap.set(id, n)
    }
    return n
  }
  const remapOpt = (id: string | null): string | null => (id == null ? null : remap(id))

  const folders = doc.folders.map(f => ({ ...f, id: remap(f.id), parentId: remapOpt(f.parentId) }))
  const projects = doc.projects.map(p => ({ ...p, id: remap(p.id), folderId: remapOpt(p.folderId) }))
  const tags = doc.tags.map(t => ({ ...t, id: remap(t.id) }))
  const repeatRules = doc.repeatRules.map(r => ({ ...r, id: remap(r.id) }))
  const tasks = doc.tasks.map(t => ({
    ...t,
    id: remap(t.id),
    projectId: remapOpt(t.projectId),
    parentId: remapOpt(t.parentId),
    repeatRuleId: remapOpt(t.repeatRuleId),
    repeatedFromTaskId: remapOpt(t.repeatedFromTaskId),
    tagIds: t.tagIds.map(remap),
  }))
  const perspectives = doc.perspectives.map(p => ({ ...p, id: remap(p.id) }))
  const attachments = doc.attachments.map(a => ({ ...a, id: remap(a.id), taskId: remap(a.taskId) }))

  return {
    ...doc,
    folders,
    projects,
    tags,
    tasks,
    perspectives,
    repeatRules,
    attachments: attachments.map((a) => {
      // attachment data 含 taskId（已是 remap 后）
      const { id, ...data } = a
      return { id, ...data, taskId: a.taskId }
    }),
  }
}

/**
 * 导入行的 apply 顺序：tags → perspectives → attachments → tasks（父先子后）→ task_tag
 *（Phase 1：project/folder 退出 GTD sync，导入导出留待 Dir API 后续支持）
 */
function orderImportRows(rows: EntityRow[]): EntityRow[] {
  const byEntity = <E extends SyncEntity>(e: E) =>
    rows.filter((r): r is EntityRowOf<E> => r.entity === e)
  const tags = byEntity('tag')
  const perspectives = byEntity('perspective')
  const attachments = byEntity('attachment')
  const taskTags = byEntity('task_tag')
  // tasks 拓扑排序：parentId 在前
  const tasks = byEntity('task')
  const taskById = new Map(tasks.map(t => [t.id, t]))
  const ordered: EntityRow[] = []
  const seen = new Set<string>()
  const visit = (t: EntityRowOf<'task'>) => {
    if (seen.has(t.id))
      return
    seen.add(t.id)
    const parentId = t.data.parentId
    if (parentId) {
      const parent = taskById.get(parentId)
      if (parent)
        visit(parent)
    }
    ordered.push(t)
  }
  for (const t of tasks)
    visit(t)
  return [...tags, ...perspectives, ...attachments, ...ordered, ...taskTags]
}
