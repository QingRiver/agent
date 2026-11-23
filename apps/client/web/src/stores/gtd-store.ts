import type {
  EntityRow,
  ForecastSignalOptions,
  ForecastStripKey,
  GroupType,
  InvariantViolation,
  NormalizeRowsOptions,
  Op,
  Perspective,
  PerspectiveInput,
  RepeatRuleInput,
  Task,
} from '@agent/gtd'
import type { GtdSelection, PerspectiveViewOptions } from '../gtd/view-options'
import {
  applyOps,
  BUILTIN_PERSPECTIVE_ID,
  BUILTIN_PERSPECTIVE_IDS,
  builtinPerspectives,
  DEFAULT_FORECAST_SIGNALS,
  DEFAULT_FORECAST_STRIP,
  entityFocusFilter,
  FORECAST_STRIP_ORDER,
  GtdModel,
  INVARIANT_TEXT,
  isBuiltinPerspectiveId,
  mergeFilter,
  normalizeRows,
  planAddChildTaskOp,
  planAddInboxTaskOp,
  planAddPerspectiveOp,
  planAddProjectTaskOp,
  planIndentTaskOp,
  planMoveTaskOp,
  PLANNED_MODE,
  planOutdentTaskOp,
  planPatchPerspectiveOp,
  planPatchTaskOp,
  planPurgeTasksOp,
  planRemovePerspectiveOp,
  planReorderTaskOp,
  planSetTaskGroupTypeOp,
  planSetTaskRepeatOp,
  planSetTaskTagsOp,
  planStatusOp,
  planToggleFlagOp,
  validateInvariants,
} from '@agent/gtd'
import { GtdApi } from '@apis/gtd-api'
import { atom, getDefaultStore } from 'jotai'
import { isContiguousStripSelection, toggleForecastStrip } from '../gtd/forecast-strip'
import {
  DEFAULT_GTD_SELECTION,
  parseGtdSelection,
  parseViewOptionsMap,
  resolveAvailabilityFilter,
  selectPerspective,
  viewOptionsScope,
} from '../gtd/view-options'
import { DirStore } from './dir-store'
import { SkillStore } from './skill-store'
import { TagsStore } from './tags-store'

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'

export type { GtdSelection }

const DUE_SOON_MS = 2 * 24 * 60 * 60 * 1000
const LS_SELECTION = 'gtd.selection'
const LS_FORECAST_STRIP = 'gtd.forecastStrip'
const LS_FORECAST_SIGNALS = 'gtd.forecastSignals'
const LS_VIEW_OPTIONS = 'gtd.viewOptions'

export type { RepeatRuleInput }

// ---------------- 选择 ----------------

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

function resolvePerspectiveBase(store: GtdModel, perspectiveId: string): Perspective {
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
  store: GtdModel,
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

function violationKeys(rows: EntityRow[]): Set<string> {
  return new Set(validateInvariants(new GtdModel(rows)).map(v => `${v.code}|${v.entityId ?? ''}|${v.message}`))
}

/** 只拒绝这次操作新引入的不变量违反；读时规则留下的旧状态不阻塞编辑。 */
function introducedViolations(before: EntityRow[], after: EntityRow[]): InvariantViolation[] {
  const existing = violationKeys(before)
  return validateInvariants(new GtdModel(after))
    .filter(v => !existing.has(`${v.code}|${v.entityId ?? ''}|${v.message}`))
}

function describeViolation(v: InvariantViolation, rows: EntityRow[]): string {
  const row = v.entityId ? rows.find(r => r.id === v.entityId) : undefined
  const subject = row?.entity === 'task' ? `「${row.data.name}」` : ''
  return `操作未执行：${subject}${INVARIANT_TEXT[v.code]}`
}

// ---------------- 内存权威缓存 + 在线 apply ----------------

const TEXT_DEBOUNCE_MS = 300

/** dir 自身或祖先被标为 skill：skill 子树里不能挂任务。 */
function insideSkill(dirId: string, dirsById: Map<string, { parentId: string | null }>, skillDirIds: Map<string, unknown>): boolean {
  const seen = new Set<string>()
  let cur: string | null = dirId
  while (cur && !seen.has(cur)) {
    if (skillDirIds.has(cur))
      return true
    seen.add(cur)
    cur = dirsById.get(cur)?.parentId ?? null
  }
  return false
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

export class GtdStore {
  static readonly userIdAtom = atom<string | undefined>(undefined)
  /** 服务端行（含未确认的乐观预览）。 */
  static readonly rawRowsAtom = atom<EntityRow[]>([])
  static readonly loadedAtom = atom(false)

  /** 读时规则用的目录：目录还没拉到时一律视为有效，避免整片任务闪进收件箱或丢标签。 */
  static readonly displayOptionsAtom = atom<NormalizeRowsOptions>((get) => {
    const options: NormalizeRowsOptions = {}
    if (get(TagsStore.loadedAtom)) {
      const tags = get(TagsStore.tagsByIdAtom)
      options.isTagLive = tagId => tags.has(tagId)
    }
    if (get(DirStore.loadedAtom)) {
      const dirs = get(DirStore.dirsByIdAtom)
      const skillDirs = get(SkillStore.skillsByDirIdAtom)
      options.isMountValid = dirId => dirs.has(dirId) && !insideSkill(dirId, dirs, skillDirs)
    }
    return options
  })

  static readonly rowsAtom = atom(get => normalizeRows(get(GtdStore.rawRowsAtom), get(GtdStore.displayOptionsAtom)))

  static readonly rowStoreAtom = atom(get => new GtdModel(get(GtdStore.rowsAtom)))
  /** 派生任务树，供 UI 读有效状态 */
  static readonly treeAtom = atom(get => get(GtdStore.rowStoreAtom).tree())

  static readonly selectionAtom = atom<GtdSelection>(readSelection())
  static readonly forecastStripAtom = atom<ForecastStripKey[]>(readForecastStrip())
  static readonly forecastSignalsAtom = atom<ForecastSignalOptions>(readForecastSignals())
  static readonly viewOptionsAtom = atom<Record<string, Partial<PerspectiveViewOptions>>>(readViewOptionsMap())
  static readonly selectedTaskIdAtom = atom<string | null>(null)
  static readonly isLoadingAtom = atom(false)
  static readonly syncStatusAtom = atom<SyncStatus>('idle')
  static readonly errorAtom = atom<string | null>(null)
  static readonly dueSoonMs = DUE_SOON_MS

  private static loadGeneration = 0
  private static applyChain: Promise<void> = Promise.resolve()
  private static textTimer: ReturnType<typeof setTimeout> | null = null
  private static textOps: Op[] = []

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
      ++GtdStore.loadGeneration
      GtdStore.clearTextDebounce()
      s.set(GtdStore.rawRowsAtom, [])
      s.set(GtdStore.loadedAtom, false)
      s.set(GtdStore.selectedTaskIdAtom, null)
      s.set(GtdStore.errorAtom, null)
      s.set(GtdStore.syncStatusAtom, 'idle')
      return
    }
    await GtdStore.load()
  }

  static async load(): Promise<void> {
    const s = GtdStore.store()
    const userId = s.get(GtdStore.userIdAtom)
    if (!userId)
      return
    const gen = ++GtdStore.loadGeneration
    s.set(GtdStore.isLoadingAtom, true)
    s.set(GtdStore.errorAtom, null)
    try {
      await GtdStore.refresh()
    }
    catch (e) {
      if (gen === GtdStore.loadGeneration)
        s.set(GtdStore.errorAtom, e instanceof Error ? e.message : String(e))
    }
    finally {
      if (gen === GtdStore.loadGeneration)
        s.set(GtdStore.isLoadingAtom, false)
    }
  }

  /** 从服务端 list 覆盖内存。 */
  static async refresh(): Promise<void> {
    const s = GtdStore.store()
    const userId = s.get(GtdStore.userIdAtom)
    if (!userId)
      return
    const { rows } = await GtdApi.list()
    if (s.get(GtdStore.userIdAtom) !== userId)
      return
    s.set(GtdStore.rawRowsAtom, rows)
    s.set(GtdStore.loadedAtom, true)
  }

  /** 立刻拉取服务端（例如 REST 删除标签后）。 */
  static async syncNow(): Promise<void> {
    const s = GtdStore.store()
    await GtdStore.flushTextDebounce()
    try {
      s.set(GtdStore.syncStatusAtom, 'syncing')
      await GtdStore.refresh()
      s.set(GtdStore.syncStatusAtom, 'idle')
    }
    catch (e) {
      s.set(GtdStore.syncStatusAtom, 'error')
      s.set(GtdStore.errorAtom, e instanceof Error ? e.message : String(e))
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

  private static clearTextDebounce(): void {
    if (GtdStore.textTimer) {
      clearTimeout(GtdStore.textTimer)
      GtdStore.textTimer = null
    }
    GtdStore.textOps = []
  }

  private static async flushTextDebounce(): Promise<void> {
    if (GtdStore.textTimer) {
      clearTimeout(GtdStore.textTimer)
      GtdStore.textTimer = null
    }
    const ops = GtdStore.textOps
    GtdStore.textOps = []
    if (ops.length > 0)
      await GtdStore.pushOps(ops)
  }

  /**
   * 一次操作：乐观改内存 →（可选防抖）POST /gtd/apply → 成功用服务端行覆盖；失败 list 盖回。
   */
  private static applyLocal(
    build: (model: GtdModel) => Op[],
    options: { debounce?: boolean } = {},
  ): boolean {
    const s = GtdStore.store()
    const userId = s.get(GtdStore.userIdAtom)
    if (!userId || !s.get(GtdStore.loadedAtom)) {
      s.set(GtdStore.errorAtom, 'GTD 数据尚未加载')
      return false
    }
    if (!isOnline()) {
      s.set(GtdStore.syncStatusAtom, 'offline')
      s.set(GtdStore.errorAtom, '离线时不能修改 GTD')
      return false
    }

    const before = s.get(GtdStore.rawRowsAtom)
    let ops: Op[]
    let after: EntityRow[]
    try {
      ops = build(new GtdModel(normalizeRows(before, s.get(GtdStore.displayOptionsAtom))))
      if (ops.length === 0)
        return false
      after = applyOps(before, ops, userId)
    }
    catch (e) {
      s.set(GtdStore.errorAtom, e instanceof Error ? e.message : String(e))
      return false
    }

    const projectedBefore = normalizeRows(before, s.get(GtdStore.displayOptionsAtom))
    const projectedAfter = normalizeRows(after, s.get(GtdStore.displayOptionsAtom))
    const violations = introducedViolations(projectedBefore, projectedAfter)
    if (violations.length > 0) {
      console.warn('[gtd] 写入违反不变量，已拒绝', violations.map(v => v.message))
      s.set(GtdStore.errorAtom, describeViolation(violations[0]!, projectedAfter))
      return false
    }

    s.set(GtdStore.rawRowsAtom, after)
    s.set(GtdStore.errorAtom, null)

    if (options.debounce) {
      // 只保留最新一批：乐观预览已是最终态，服务器只需最后一次补丁
      GtdStore.textOps = ops
      if (GtdStore.textTimer)
        clearTimeout(GtdStore.textTimer)
      GtdStore.textTimer = setTimeout(() => {
        GtdStore.textTimer = null
        const batch = GtdStore.textOps
        GtdStore.textOps = []
        void GtdStore.pushOps(batch)
      }, TEXT_DEBOUNCE_MS)
      return true
    }

    void GtdStore.flushTextDebounce().then(() => GtdStore.pushOps(ops))
    return true
  }

  private static async pushOps(ops: Op[]): Promise<void> {
    if (ops.length === 0)
      return
    const run = async () => {
      const s = GtdStore.store()
      if (!isOnline()) {
        s.set(GtdStore.syncStatusAtom, 'offline')
        s.set(GtdStore.errorAtom, '离线时不能修改 GTD')
        await GtdStore.refresh().catch(() => undefined)
        return
      }
      s.set(GtdStore.syncStatusAtom, 'syncing')
      try {
        const { rows } = await GtdApi.apply({ ops })
        s.set(GtdStore.rawRowsAtom, rows)
        s.set(GtdStore.syncStatusAtom, 'idle')
        s.set(GtdStore.errorAtom, null)
      }
      catch (e) {
        s.set(GtdStore.syncStatusAtom, 'error')
        s.set(GtdStore.errorAtom, e instanceof Error ? e.message : String(e))
        try {
          await GtdStore.refresh()
        }
        catch {
          // refresh 失败保留错误信息
        }
      }
    }
    GtdStore.applyChain = GtdStore.applyChain.then(run, run)
    await GtdStore.applyChain
  }

  // ---------- Tasks（领域编排在 @agent/gtd plan） ----------

  static addInboxTask(name: string): void {
    GtdStore.applyLocal(reader => planAddInboxTaskOp(reader, name))
  }

  static addProjectTask(mountDirId: string, name: string): void {
    GtdStore.applyLocal(reader => planAddProjectTaskOp(reader, mountDirId, name))
  }

  static addChildTask(parentId: string, name: string): void {
    GtdStore.applyLocal(reader => planAddChildTaskOp(reader, parentId, name))
  }

  static indentTask(taskId: string): void {
    GtdStore.applyLocal(reader => planIndentTaskOp(reader, taskId))
  }

  static outdentTask(taskId: string): void {
    GtdStore.applyLocal(reader => planOutdentTaskOp(reader, taskId))
  }

  static setTaskGroupType(taskId: string, type: GroupType | null): void {
    GtdStore.applyLocal(reader => planSetTaskGroupTypeOp(reader, taskId, type))
  }

  static reorderTask(
    taskId: string,
    target: { beforeId: string | null, afterId: string | null },
  ): void {
    GtdStore.applyLocal(reader => planReorderTaskOp(reader, taskId, target))
  }

  static completeTask(taskId: string): void {
    GtdStore.applyLocal(reader => planStatusOp(reader, 'complete', taskId))
  }

  static dropTask(taskId: string): void {
    GtdStore.applyLocal(reader => planStatusOp(reader, 'drop', taskId))
  }

  static reopenTask(taskId: string): void {
    GtdStore.applyLocal(reader => planStatusOp(reader, 'reopen', taskId))
  }

  /** 恢复搁置：HOLD → ACTIVE。压制子的 UI 置灰见 Inspector/TaskRow。 */
  static restoreTask(taskId: string): void {
    GtdStore.applyLocal(reader => planStatusOp(reader, 'restore', taskId))
  }

  static deleteTaskLogical(taskId: string): void {
    GtdStore.applyLocal(reader => planStatusOp(reader, 'delete', taskId))
  }

  /** 移出回收站：DELETED → ACTIVE。压制子的 UI 置灰见 Inspector/TaskRow。 */
  static restoreFromTrash(taskId: string): void {
    GtdStore.applyLocal(reader => planStatusOp(reader, 'restore_from_trash', taskId))
  }

  /** 永久删除回收站任务（含子树）。 */
  static purgeTrash(taskIds: string[]): void {
    const s = GtdStore.store()
    const ok = GtdStore.applyLocal(() => planPurgeTasksOp(taskIds))
    const sel = s.get(GtdStore.selectedTaskIdAtom)
    if (ok && sel && taskIds.includes(sel))
      s.set(GtdStore.selectedTaskIdAtom, null)
  }

  static toggleFlag(taskId: string): void {
    GtdStore.applyLocal(reader => planToggleFlagOp(reader, taskId))
  }

  /**
   * 换容器（项目 / 父任务）。`parentId` 省略保留原父子；显式 `null` 变根。
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
    GtdStore.applyLocal(reader => planMoveTaskOp(reader, taskId, dest))
  }

  static patchTask(taskId: string, patch: Partial<Task>): void {
    const keys = Object.keys(patch).filter(k => k !== 'updatedAt')
    const textOnly = keys.length > 0 && keys.every(k => k === 'name' || k === 'note')
    GtdStore.applyLocal(reader => planPatchTaskOp(reader, taskId, patch), { debounce: textOnly })
  }

  static setTaskRepeat(taskId: string, input: RepeatRuleInput | null): void {
    GtdStore.applyLocal(reader => planSetTaskRepeatOp(reader, taskId, input))
  }

  static setTaskTags(taskId: string, tagIds: string[]): void {
    GtdStore.applyLocal(reader => planSetTaskTagsOp(reader, taskId, tagIds))
  }

  // ---------- Perspectives ----------

  static addPerspective(input: PerspectiveInput): boolean {
    const dirs = GtdStore.store().get(DirStore.validationRefsAtom)
    const tags = GtdStore.store().get(TagsStore.tagRefsAtom)
    return GtdStore.applyLocal(() => planAddPerspectiveOp(input, perspectiveValidationContext(dirs, tags)))
  }

  static patchPerspective(id: string, input: PerspectiveInput): boolean {
    const dirs = GtdStore.store().get(DirStore.validationRefsAtom)
    const tags = GtdStore.store().get(TagsStore.tagRefsAtom)
    return GtdStore.applyLocal(reader =>
      planPatchPerspectiveOp(reader, id, input, perspectiveValidationContext(dirs, tags)))
  }

  static removePerspective(id: string): void {
    const s = GtdStore.store()
    GtdStore.applyLocal(() => planRemovePerspectiveOp(id))
    const selection = s.get(GtdStore.selectionAtom)
    if (selection.perspectiveId === id)
      GtdStore.setSelection(selectPerspective(BUILTIN_PERSPECTIVE_ID.FORECAST))
  }
}
