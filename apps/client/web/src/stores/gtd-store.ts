import type {
  EntityRow,
  EntityRowOf,
  ForecastSignalOptions,
  ForecastStripKey,
  GroupType,
  GtdCommand,
  GtdMutation,
  Perspective,
  PerspectiveInput,
  RepeatRule,
  SyncEntity,
  Task,
} from '@agent/gtd'
import type { SyncStatus } from '../gtd/sync-engine'
import type { GtdSelection, PerspectiveViewOptions } from '../gtd/view-options'
import {
  buildTaskTree,
  BUILTIN_PERSPECTIVE_ID,
  BUILTIN_PERSPECTIVE_IDS,
  builtinPerspectives,
  DEFAULT_FORECAST_SIGNALS,
  DEFAULT_FORECAST_STRIP,
  effectiveStatus,
  entityFocusFilter,
  EXPLICIT_STATUS,
  FORECAST_STRIP_ORDER,
  GROUP_TYPE,
  isBuiltinPerspectiveId,
  isMutation,
  isRemotePurgedReason,
  mergeFilter,
  normalizeDeferDue,
  orderBetween,
  orderImportRows,
  parseRemotePurgedName,
  parseRows,
  PLANNED_MODE,
  reindexSiblings,
  remapRowIds,
  REPEAT_ANCHOR,
  RowStore,
  serializeRows,
  shouldReindex,
  shouldStop,
  validateInvariants,
  validatePerspectiveInput,
} from '@agent/gtd'
import { GtdApi } from '@apis/gtd-api'
import { atom, getDefaultStore } from 'jotai'
import { isContiguousStripSelection, toggleForecastStrip } from '../gtd/forecast-strip'
import { applyLocal as applyRows, loadRows, mergeChanges, persistAndQueue, persistLastSyncId, persistRows, removeOutboxIds } from '../gtd/row-store'
import { SyncEngine } from '../gtd/sync-engine'
import {
  DEFAULT_GTD_SELECTION,
  parseGtdSelection,
  parseViewOptionsMap,
  resolveAvailabilityFilter,
  selectPerspective,
  viewOptionsScope,
} from '../gtd/view-options'
import { DirStore } from './dir-store'
import { TagsStore } from './tags-store'

export type { GtdSelection }

const DUE_SOON_MS = 2 * 24 * 60 * 60 * 1000
const LS_SELECTION = 'gtd.selection'
const LS_FORECAST_STRIP = 'gtd.forecastStrip'
const LS_FORECAST_SIGNALS = 'gtd.forecastSignals'
const LS_VIEW_OPTIONS = 'gtd.viewOptions'

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

/** OF4 Inherited Tags Assignment：目标无标时复制父 task_tag（新建可传 ownTagIds=[]）；已有标不覆盖。 */
function copyTagMutsFromParent(
  store: RowStore,
  taskId: string,
  parentId: string | null | undefined,
  ownTagIds?: readonly string[],
): GtdMutation[] {
  if (parentId == null)
    return []
  const own = ownTagIds ?? store.tagIdsOf(taskId)
  if (own.length > 0)
    return []
  return store.tagIdsOf(parentId).map(tagId =>
    upsertMut('task_tag', `${taskId}|${tagId}`, { taskId, tagId }),
  )
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

function collectDescendantIds(store: RowStore, rootId: string): string[] {
  const out: string[] = []
  const visit = (pid: string) => {
    for (const t of store.liveTasks()) {
      if (t.data.parentId === pid) {
        out.push(t.id)
        visit(t.id)
      }
    }
  }
  visit(rootId)
  return out
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

export type RepeatRuleInput = Omit<RepeatRule, 'id' | 'completedOccurrences'>

function readSelection(): GtdSelection {
  try {
    const raw = localStorage.getItem(LS_SELECTION)
    if (!raw)
      return DEFAULT_GTD_SELECTION
    return parseGtdSelection(raw)
  }
  catch {
    // ignore
  }
  return DEFAULT_GTD_SELECTION
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

function readViewOptionsMap(): Record<string, Partial<PerspectiveViewOptions>> {
  try {
    const raw = localStorage.getItem(LS_VIEW_OPTIONS)
    if (!raw)
      return {}
    return parseViewOptionsMap(raw)
  }
  catch {
    return {}
  }
}

function writeViewOptionsMap(map: Record<string, Partial<PerspectiveViewOptions>>): void {
  try {
    localStorage.setItem(LS_VIEW_OPTIONS, JSON.stringify(map))
  }
  catch {
    // ignore
  }
}

/** 透视校验上下文：projects/tags 均来自在线目录缓存（DirStore / TagsStore） */
function perspectiveValidationContext(
  dirs: { projects: { id: string, name: string }[] },
  tags: { id: string, name: string }[],
) {
  return {
    now: new Date(),
    timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
    projects: dirs.projects,
    tags,
    builtinPerspectiveIds: BUILTIN_PERSPECTIVE_IDS,
  }
}

function resolvePerspectiveBase(store: RowStore, perspectiveId: string): Perspective {
  if (isBuiltinPerspectiveId(perspectiveId)) {
    const builtin = builtinPerspectives().find(p => p.id === perspectiveId)
    return builtin ?? builtinPerspectives()[0]!
  }
  const row = store.livePerspectives().find(p => p.id === perspectiveId)
  if (row) {
    // row.data.filter 在 zod 为 unknown；写入时已经 validatePerspectiveInput
    return {
      id: row.id,
      ...row.data,
      filter: row.data.filter as Perspective['filter'],
    }
  }
  return builtinPerspectives()[0]!
}

/** base 透视 + mergeFilter(实体焦点)；有 focus 时去掉同名 groupBy 键 */
export function resolvePerspective(
  store: RowStore,
  selection: GtdSelection,
): Perspective {
  const base = resolvePerspectiveBase(store, selection.perspectiveId)
  const focus = selection.focus
  const filter = mergeFilter(base.filter, focus ? entityFocusFilter(focus) : null)
  const groupBy = focus
    ? base.groupBy.filter(k => k !== focus.field)
    : base.groupBy
  return { ...base, id: selection.perspectiveId, filter, groupBy }
}

/** 当前透视的可用性过滤（View Options 本地覆盖） */
export function resolvePerspectiveAvailability(
  selection: GtdSelection,
  viewOptionsMap: Record<string, Partial<PerspectiveViewOptions>> = {},
) {
  const scope = viewOptionsScope(selection)
  return resolveAvailabilityFilter(scope, viewOptionsMap[scope])
}

// ---------------- row 形状小工具 ----------------

function tShape(s: EntityRowOf<'task'>) {
  return { id: s.id, ...s.data }
}

/** server soft reject：目录缺失 / 远端 purge → 不 syncLocked */
function isSoftReject(reason: string): boolean {
  return /^tag .+ not found$/.test(reason) || isRemotePurgedReason(reason)
}

/** 从 outbox 条目解析关联的 task id */
function taskIdFromOutboxItem(item: GtdMutation | GtdCommand): string | null {
  if (isMutation(item)) {
    if (item.entity === 'task')
      return item.entityId
    if (item.op === 'upsert' && item.entity === 'task_tag')
      return item.patch.taskId
    if (item.op === 'upsert' && item.entity === 'attachment') {
      const tid = item.patch?.taskId
      return typeof tid === 'string' ? tid : null
    }
    if (item.op === 'delete' && item.entity === 'task_tag') {
      const bar = item.entityId.indexOf('|')
      return bar > 0 ? item.entityId.slice(0, bar) : null
    }
    if (item.op === 'delete' && item.entity === 'attachment') {
      // attachment delete 无 taskId；无法从 entityId 反查
      return null
    }
    return null
  }
  return item.taskId
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
  static readonly rowStoreAtom = atom(get => new RowStore(get(GtdStore.rowsAtom)))
  /** 派生 TaskTree（live tasks 建树）；供 UI 读 effectiveStatus（洪水继承：删父/搁置父的子有效态被压） */
  static readonly treeAtom = atom(get => buildTaskTree(get(GtdStore.rowStoreAtom).liveTasks()))

  static readonly selectionAtom = atom<GtdSelection>(readSelection())
  static readonly forecastStripAtom = atom<ForecastStripKey[]>(readForecastStrip())
  static readonly forecastSignalsAtom = atom<ForecastSignalOptions>(readForecastSignals())
  static readonly viewOptionsAtom = atom<Record<string, Partial<PerspectiveViewOptions>>>(readViewOptionsMap())
  static readonly selectedTaskIdAtom = atom<string | null>(null)
  static readonly isLoadingAtom = atom(false)
  static readonly syncStatusAtom = atom<SyncStatus>('idle')
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
      engine.setRejectedListener((rejected, outboxSnapshot) => {
        const soft = rejected.filter(r => isSoftReject(r.reason))
        const hard = rejected.filter(r => !isSoftReject(r.reason))
        const remotePurged = soft.filter(r => isRemotePurgedReason(r.reason))
        if (remotePurged.length > 0)
          GtdStore.forkRemotePurgedToTrash(remotePurged, outboxSnapshot)
        if (hard.length === 0) {
          if (rejected.length) {
            const msgs = soft.map((r) => {
              if (isRemotePurgedReason(r.reason)) {
                const name = parseRemotePurgedName(r.reason) ?? '任务'
                return `任务「${name}」已在远端被删除`
              }
              return r.reason
            })
            s.set(GtdStore.errorAtom, msgs.join('；'))
          }
          return
        }
        s.set(GtdStore.syncLockedAtom, true)
        s.set(GtdStore.errorAtom, hard.map(r => r.reason).join('; '))
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
  }

  /** 三段条点击：连续多选扩展/端点收缩 */
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

  /** 当前透视的 View Options 本地覆盖（不写回透视定义） */
  static patchViewOptions(patch: Partial<PerspectiveViewOptions>): void {
    const s = GtdStore.store()
    const sel = s.get(GtdStore.selectionAtom)
    const scope = viewOptionsScope(sel)
    const map = { ...s.get(GtdStore.viewOptionsAtom) }
    map[scope] = { ...map[scope], ...patch }
    s.set(GtdStore.viewOptionsAtom, map)
    writeViewOptionsMap(map)
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

  /**
   * REST 改了绑定行（删标 untag 等）后：pull 进 IDB，并强制刷 rowsAtom。
   * 不依赖 GtdSync 是否挂载 / onSynced 是否已注册。
   */
  static async refreshBindingsFromServer(): Promise<void> {
    const s = GtdStore.store()
    const engine = getSyncEngine()
    await engine.syncRemoteBindings()
    s.set(GtdStore.rowsAtom, await loadRows())
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
      const id = newId()
      const order = nextOrder(store.liveTasks().filter(t => t.data.mountDirId == null && t.data.parentId == null).map(tShape))
      return [cmd({ type: 'create_task', taskId: id, name: trimmed, parentId: null, order, mountDirId: null })]
    })
  }

  static addProjectTask(mountDirId: string, name: string): void {
    const trimmed = name.trim()
    if (!trimmed)
      return
    GtdStore.applyLocal((store) => {
      const id = newId()
      const siblings = store.liveTasks().filter(t => t.data.mountDirId === mountDirId && t.data.parentId == null).map(tShape)
      return [cmd({ type: 'create_task', taskId: id, name: trimmed, parentId: null, order: nextOrder(siblings), mountDirId })]
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
      const tree = buildTaskTree(store.liveTasks())
      if (effectiveStatus(parent, tree) !== EXPLICIT_STATUS.ACTIVE)
        throw new Error('父任务非活跃状态，不允许添加子任务')
      const now = nowIso()
      const id = newId()
      const children = store.liveTasks().filter(t => t.data.parentId === parentId).map(tShape)
      const items: Array<GtdMutation | GtdCommand> = [
        cmd({ type: 'create_task', taskId: id, name: trimmed, parentId, order: nextOrder(children), mountDirId: parent.data.mountDirId }),
        ...copyTagMutsFromParent(store, id, parentId, []),
      ]
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
      const tree = buildTaskTree(store.liveTasks())
      if (effectiveStatus(task, tree) !== EXPLICIT_STATUS.ACTIVE)
        throw new Error('任务非活跃状态，不允许缩进')
      const siblings = sortedByOrder(store.liveTasks().filter(t =>
        t.data.mountDirId === task.data.mountDirId && t.data.parentId === task.data.parentId,
      ).map(tShape))
      const index = siblings.findIndex(t => t.id === taskId)
      const parent = index > 0 ? siblings[index - 1]! : null
      if (!parent)
        throw new Error('当前任务前面没有可作为父级的任务')
      const now = nowIso()
      const children = store.liveTasks().filter(t => t.data.parentId === parent.id && t.id !== taskId).map(tShape)
      // parentId/order 走 move_task 命令（自带拉回）；mountDirId 不变（同 project 内缩进）；updatedAt 走 upsert
      const items: Array<GtdMutation | GtdCommand> = [
        cmd({ type: 'move_task', taskId, parentId: parent.id, order: nextOrder(children) }),
        upsertMut('task', taskId, { updatedAt: now }),
        ...copyTagMutsFromParent(store, taskId, parent.id),
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
      const tree = buildTaskTree(store.liveTasks())
      if (effectiveStatus(task, tree) !== EXPLICIT_STATUS.ACTIVE)
        throw new Error('任务非活跃状态，不允许移出')
      const parentSiblings = sortedByOrder(store.liveTasks().filter(t =>
        t.data.mountDirId === parent.data.mountDirId && t.data.parentId === parent.data.parentId && t.id !== taskId,
      ).map(tShape))
      const parentIndex = parentSiblings.findIndex(t => t.id === parent.id)
      const after = parentIndex >= 0 ? parentSiblings[parentIndex + 1] ?? null : null
      const remainingChildren = store.liveTasks().filter(t => t.data.parentId === parent.id && t.id !== taskId)
      const now = nowIso()
      const items: Array<GtdMutation | GtdCommand> = [
        cmd({ type: 'move_task', taskId, parentId: parent.data.parentId, order: orderBetween(parent.data.order, after?.order ?? null) }),
        upsertMut('task', taskId, { updatedAt: now }),
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
        upsertMut('task', taskId, { order: result.order, updatedAt: now }),
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
      return [cmd({ type: 'reopen', taskId })]
    })
  }

  /**
   * 恢复搁置：HOLD → ACTIVE。只发自身 command（物理保真模型下 restore 仅作用于物理 HOLD 项）。
   * 被祖先 hold 压制的子（物理仍 ACTIVE）按钮已置灰——单 restore 自身是 noop（阻断在父），
   * 须从压制祖先操作让洪水退去；故 UI 不对该子暴露此操作（GtdInspector/GtdTaskRow 置灰）。
   */
  static restoreTask(taskId: string): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      return [cmd({ type: 'restore', taskId })]
    })
  }

  static deleteTaskLogical(taskId: string): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      // delete → 进回收站；仅 ACTIVE（SP-STATE-6）
      return [cmd({ type: 'delete', taskId })]
    })
  }

  /**
   * 移出回收站：DELETED → ACTIVE。只发自身 command（物理保真模型下 restore_from_trash 仅作用于物理 DELETED 项）。
   * 被祖先 deleted 压制的子（物理仍 ACTIVE）按钮已置灰——单 restore_from_trash 自身是 noop（阻断在父），
   * 须从压制祖先操作让洪水退去；故 UI 不对该子暴露此操作（GtdInspector/GtdTaskRow 置灰）。
   */
  static restoreFromTrash(taskId: string): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      return [cmd({ type: 'restore_from_trash', taskId })]
    })
  }

  /**
   * 在线永久删除回收站任务（旁路 outbox）。
   * 须 online；成功后 merge 权威 changes。
   */
  static async purgeTrash(taskIds: string[]): Promise<void> {
    const s = GtdStore.store()
    if (!navigator.onLine) {
      s.set(GtdStore.errorAtom, '永久删除需要联网')
      return
    }
    if (taskIds.length === 0)
      return
    try {
      const res = await GtdApi.purgeTrash({ taskIds })
      s.set(GtdStore.rowsAtom, mergeChanges(s.get(GtdStore.rowsAtom), res.changes))
      await persistRows(res.changes)
      await persistLastSyncId(res.serverSyncId)
      if (res.skipped.length > 0) {
        s.set(
          GtdStore.errorAtom,
          res.skipped.map(x => `${x.id}: ${x.reason}`).join('; '),
        )
      }
      else {
        s.set(GtdStore.errorAtom, null)
      }
      const sel = s.get(GtdStore.selectedTaskIdAtom)
      if (sel && taskIds.includes(sel))
        s.set(GtdStore.selectedTaskIdAtom, null)
    }
    catch (e) {
      s.set(GtdStore.errorAtom, e instanceof Error ? e.message : String(e))
    }
  }

  /**
   * REMOTE_PURGED：把本地理应更新的内容 fork 为新 id 进回收站，并清旧 id 相关 outbox。
   * 在 SyncEngine rebase 前调用（仍持有 outbox 快照）。
   */
  private static forkRemotePurgedToTrash(
    rejected: Array<{ id: string, reason: string }>,
    outboxSnapshot: Array<GtdMutation | GtdCommand>,
  ): void {
    const byOutboxId = new Map(outboxSnapshot.map(i => [i.id, i]))
    const oldTaskIds = new Set<string>()
    for (const r of rejected) {
      const item = byOutboxId.get(r.id)
      if (!item)
        continue
      const tid = taskIdFromOutboxItem(item)
      if (tid)
        oldTaskIds.add(tid)
    }
    if (oldTaskIds.size === 0)
      return

    // 清所有仍指向旧 id 的 outbox（含未在本批 rejected 的）
    const extraOutboxIds = outboxSnapshot
      .filter((i) => {
        const tid = taskIdFromOutboxItem(i)
        return tid != null && oldTaskIds.has(tid)
      })
      .map(i => i.id)
    void removeOutboxIds(extraOutboxIds)

    const s = GtdStore.store()
    const rows = s.get(GtdStore.rowsAtom)
    const store = new RowStore(rows)
    const ts = nowIso()

    for (const oldId of oldTaskIds) {
      // 含 tombstone：优先 live，否则任意同 id 行
      const old = store.findLive('task', oldId)
        ?? rows.find((r): r is EntityRowOf<'task'> => r.entity === 'task' && r.id === oldId)
      if (!old)
        continue
      const newId = crypto.randomUUID()
      const tagIds = store.tagIdsOf(oldId)
      // patch 剥离后 task upsert 不可建行（缺 status/parentId）；fork 走 create_task 建行 + upsert 补内容。
      // 不走 delete 进回收站：delete 是命令（commands 阶段先执行），内容 upsert 是 mutation（后执行），
      // 同一 push 内 delete 会先于 content upsert → upsert 命中 DELETED 行 noop → 内容丢失。
      // 故 fork 以 ACTIVE 形态落盘（保内容优先于隐藏进回收站）；用户可再手动删除。
      // parent 已随 purge 消失则降级为顶层（避免 create_task 引用校验拒绝 fork）。
      const forkParent = old.data.parentId != null && store.findLive('task', old.data.parentId)
        ? old.data.parentId
        : null
      const {
        status: _s,
        parentId: _p,
        name: _n,
        order: _o,
        mountDirId: _m,
        completedAt: _c,
        heldAt: _h,
        droppedAt: _d,
        repeatedFromTaskId: _r,
        createdAt: _ca,
        updatedAt: _ua,
        ...content
      } = old.data
      GtdStore.applyLocal(() => {
        const items: Array<GtdMutation | GtdCommand> = [
          cmd({ type: 'create_task', taskId: newId, name: old.data.name, parentId: forkParent, order: old.data.order, mountDirId: old.data.mountDirId }),
          upsertMut('task', newId, { ...content, updatedAt: ts }),
        ]
        for (const tagId of tagIds) {
          items.push(upsertMut('task_tag', `${newId}|${tagId}`, { taskId: newId, tagId }))
        }
        return items
      })
    }
  }

  static toggleFlag(taskId: string): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      return [upsertMut('task', taskId, { flagged: !task.data.flagged, updatedAt: nowIso() })]
    })
  }

  /**
   * 换容器（项目 / 父任务）。order 是同级坐标，不能跟着旧值进新列表；
   * 默认插到目标同级末尾，算法与拖拽相同（orderBetween / 必要时 reindex）。
   * `parentId` 省略则保留原父子；仅显式传 `null` 才变根。
   */
  static moveTask(
    taskId: string,
    dest: {
      mountDirId: string | null
      parentId?: string | null
      beforeId?: string | null
      afterId?: string | null
    },
  ): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      const nextMount = dest.mountDirId
      // 省略 parentId → 保留原父子；仅显式 null 才变根（Inspector 换项目只传 mountDirId）
      const nextParent = dest.parentId !== undefined ? dest.parentId : task.data.parentId
      if (nextParent && !nextMount)
        throw new Error('Inbox 不能有子任务')
      const descendantIds = collectDescendantIds(store, taskId)
      if (nextMount == null && descendantIds.length > 0)
        throw new Error('有子任务的任务不能移回收件箱')
      if (nextParent === taskId || (nextParent != null && descendantIds.includes(nextParent)))
        throw new Error('不能移到自己的子树下')
      if (
        task.data.mountDirId === nextMount
        && task.data.parentId === nextParent
        && dest.beforeId === undefined
        && dest.afterId === undefined
      ) {
        return []
      }
      const siblings = store.liveTasks()
        .filter(t => t.id !== taskId && t.data.mountDirId === nextMount && t.data.parentId === nextParent)
        .map(tShape)
      const placed = dest.beforeId !== undefined || dest.afterId !== undefined
        ? targetOrder(siblings, dest.beforeId ?? null, dest.afterId ?? null)
        : targetOrder(siblings, sortedByOrder(siblings).at(-1)?.id ?? null, null)
      const now = nowIso()
      const parentChanged = nextParent !== task.data.parentId
      // parentId/order 走 move_task 命令（自带拉回 + 防环；patch 已剥离 parentId）；
      // mountDirId 走 upsert（无约束 LWW，命令不含 mountDirId）。
      const items: Array<GtdMutation | GtdCommand> = [
        cmd({ type: 'move_task', taskId, parentId: nextParent, order: placed.order }),
        upsertMut('task', taskId, { mountDirId: nextMount, updatedAt: now }),
      ]
      // 换父且自身无标 → 复制新父标签（OF Inherited Tags Assignment）
      if (parentChanged)
        items.push(...copyTagMutsFromParent(store, taskId, nextParent))
      for (const sib of siblings) {
        const order = placed.reindexed.get(sib.id)
        if (order != null)
          items.push(upsertMut('task', sib.id, { order, updatedAt: now }))
      }
      if (nextMount != null) {
        for (const id of descendantIds)
          items.push(upsertMut('task', id, { mountDirId: nextMount, updatedAt: now }))
      }
      return items
    })
  }

  static patchTask(taskId: string, patch: Partial<Task>): void {
    GtdStore.applyLocal((store) => {
      const task = store.findLive('task', taskId)
      if (!task)
        throw new Error('任务不存在')
      if (Object.hasOwn(patch, 'mountDirId') || Object.hasOwn(patch, 'parentId') || Object.hasOwn(patch, 'order'))
        throw new Error('换项目或排序请用 moveTask / reorderTask')
      const rule = task.data.repeatRuleId != null ? task.data.repeatRule : null
      if (rule?.anchor === REPEAT_ANCHOR.DUE && patch.dueDate === null)
        throw new Error('按截止日重复的任务不能清空截止日期')
      if (rule?.anchor === REPEAT_ANCHOR.DEFER && patch.deferDate === null)
        throw new Error('按推迟日重复的任务不能清空推迟日期')
      // 行模型：标签走 task_tag；repeatRule/repeatRuleId 由 setTaskRepeat 维护
      const { id: _id, repeatRuleId: _rid, ...rest } = patch
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
    const tags = GtdStore.store().get(TagsStore.tagRefsAtom)
    return GtdStore.applyLocal((_store) => {
      const result = validatePerspectiveInput(
        input,
        perspectiveValidationContext(dirs, tags),
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
        createdAt: now,
        updatedAt: null,
      }
      return [upsertMut('perspective', id, data)]
    })
  }

  static patchPerspective(id: string, input: PerspectiveInput): boolean {
    const dirs = GtdStore.store().get(DirStore.validationRefsAtom)
    const tags = GtdStore.store().get(TagsStore.tagRefsAtom)
    return GtdStore.applyLocal((store) => {
      if (!store.livePerspectives().some(p => p.id === id))
        throw new Error('自定义透视不存在')
      const result = validatePerspectiveInput(
        input,
        perspectiveValidationContext(dirs, tags),
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
        updatedAt: nowIso(),
      })]
    })
  }

  static removePerspective(id: string): void {
    const s = GtdStore.store()
    GtdStore.applyLocal(() => [deleteMut('perspective', id)])
    const selection = s.get(GtdStore.selectionAtom)
    if (selection.perspectiveId === id)
      GtdStore.setSelection(selectPerspective(BUILTIN_PERSPECTIVE_ID.FORECAST))
  }

  // ---------- 导入 / 导出（行级 JSON v2.0.0） ----------

  /** 导出：live rows → serializeRows（仅新建快照，syncId 归零） */
  static exportDocument(): string {
    const s = GtdStore.store()
    const rows = s.get(GtdStore.rowsAtom)
    return serializeRows(rows, new Date())
  }

  /**
   * 导入：JSON → parseRows → remapRowIds（全量换新 id，仅新建不覆盖）→
   * orderImportRows → applyLocal → push。
   */
  static importDocument(json: string): boolean {
    const s = GtdStore.store()
    const userId = s.get(GtdStore.userIdAtom) ?? 'u1'
    let rows: EntityRow[]
    try {
      rows = parseRows(json)
    }
    catch (e) {
      s.set(GtdStore.errorAtom, `导入失败：${e instanceof Error ? e.message : String(e)}`)
      return false
    }
    const ordered = orderImportRows(remapRowIds(rows, userId))
    const items = ordered.map(r => upsertMut(r.entity, r.id, r.data as Record<string, unknown>))
    return GtdStore.applyLocal(() => items)
  }
}
