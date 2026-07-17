import type {
  Folder,
  GroupType,
  GtdDocument,
  Perspective,
  PerspectiveInput,
  Project,
  RepeatRule,
  Tag,
  Task,
} from '@agent/gtd'
import {
  AVAILABILITY_FILTER,
  builtinPerspectives,
  complete,
  deleteTask,
  drop,
  EXPLICIT_STATUS,
  FILTER_FIELD,
  FILTER_OP,
  FOLDER_STATUS,
  GROUP_TYPE,
  hold,
  markReviewed,
  orderBetween,
  PERSPECTIVE_MATCH,
  reindexSiblings,
  reopen,
  REPEAT_ANCHOR,
  restore,
  resume,
  REVIEW_INTERVAL,
  shouldReindex,
  SORT_DIR,
  SORT_FIELD,
  toPerspectiveFilterRules,
  validateInvariants,
  validatePerspectiveInput,
} from '@agent/gtd'
import { GtdApi } from '@apis/gtd-api'
import { atom, getDefaultStore } from 'jotai'

const SAVE_DEBOUNCE_MS = 400
const DUE_SOON_MS = 2 * 24 * 60 * 60 * 1000
const LS_SELECTION = 'gtd.selection'

export type GtdSelection
  = | { kind: 'perspective', id: string }
    | { kind: 'project', id: string }
    | { kind: 'tag', id: string }
    | { kind: 'folder', id: string }

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

function emptyDoc(): GtdDocument {
  const now = nowIso()
  return {
    version: '1',
    meta: { createdAt: now, updatedAt: now, schemaVersion: '1' },
    folders: [],
    projects: [],
    tags: [],
    tasks: [],
    perspectives: [],
    repeatRules: [],
    attachments: [],
  }
}

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

export type RepeatRuleInput = Omit<RepeatRule, 'id' | 'completedOccurrences'>

function readSelection(): GtdSelection {
  try {
    const raw = localStorage.getItem(LS_SELECTION)
    if (!raw)
      return { kind: 'perspective', id: 'inbox' }
    const parsed = JSON.parse(raw) as GtdSelection
    if (parsed && typeof parsed === 'object' && 'kind' in parsed && 'id' in parsed)
      return parsed
  }
  catch {
    // ignore
  }
  return { kind: 'perspective', id: 'inbox' }
}

function writeSelection(sel: GtdSelection): void {
  try {
    localStorage.setItem(LS_SELECTION, JSON.stringify(sel))
  }
  catch {
    // ignore
  }
}

function touchMeta(doc: GtdDocument): GtdDocument {
  return {
    ...doc,
    meta: { ...doc.meta, updatedAt: nowIso() },
  }
}

function perspectiveValidationContext(doc: GtdDocument) {
  return {
    now: new Date(),
    timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
    projects: doc.projects.map(({ id, name }) => ({ id, name })),
    folders: doc.folders.map(({ id, name, parentId }) => ({ id, name, parentId })),
    tags: doc.tags.map(({ id, name, parentId }) => ({ id, name, parentId })),
    builtinPerspectiveIds: builtinPerspectives().map(p => p.id),
  }
}

/** 按 selection 解析用于渲染的 Perspective（内置或临时过滤） */
export function resolvePerspective(doc: GtdDocument, selection: GtdSelection): Perspective {
  if (selection.kind === 'perspective') {
    const builtin = builtinPerspectives().find(p => p.id === selection.id)
    if (builtin)
      return builtin
    const custom = doc.perspectives.find(p => p.id === selection.id)
    if (custom)
      return custom
    return builtinPerspectives()[0]!
  }
  if (selection.kind === 'project') {
    return {
      id: `project:${selection.id}`,
      name: '项目',
      icon: null,
      matchMode: PERSPECTIVE_MATCH.ALL,
      filterRules: [{ field: FILTER_FIELD.PROJECT, op: FILTER_OP.EQ, value: selection.id }],
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
      matchMode: PERSPECTIVE_MATCH.ALL,
      filterRules: [{ field: FILTER_FIELD.TAG, op: FILTER_OP.IN, value: [selection.id] }],
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
    matchMode: PERSPECTIVE_MATCH.ALL,
    filterRules: [{ field: FILTER_FIELD.FOLDER, op: FILTER_OP.EQ, value: selection.id }],
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

export class GtdStore {
  static readonly userIdAtom = atom<string | undefined>(undefined)
  static readonly docAtom = atom<GtdDocument>(emptyDoc())
  static readonly selectionAtom = atom<GtdSelection>(readSelection())
  static readonly selectedTaskIdAtom = atom<string | null>(null)
  static readonly selectedProjectIdAtom = atom<string | null>(null)
  static readonly isLoadingAtom = atom(false)
  static readonly savingAtom = atom(false)
  static readonly errorAtom = atom<string | null>(null)
  static readonly dueSoonMs = DUE_SOON_MS

  private static loadGeneration = 0
  private static saveTimer: ReturnType<typeof setTimeout> | null = null
  private static snapshotBeforeMutate: GtdDocument | null = null

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
      GtdStore.cancelSave()
      s.set(GtdStore.docAtom, emptyDoc())
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
      const document = await GtdApi.getDocument()
      if (gen !== GtdStore.loadGeneration)
        return
      s.set(GtdStore.docAtom, document)
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

  /** 本地变更 → 校验 → debounce save；失败回滚 */
  private static applyLocal(mutator: (doc: GtdDocument) => GtdDocument): boolean {
    const s = GtdStore.store()
    const prev = s.get(GtdStore.docAtom)
    GtdStore.snapshotBeforeMutate = prev
    let next: GtdDocument
    try {
      next = touchMeta(mutator(prev))
    }
    catch (e) {
      s.set(GtdStore.errorAtom, e instanceof Error ? e.message : String(e))
      return false
    }
    const violations = validateInvariants(next)
    if (violations.length > 0) {
      s.set(GtdStore.errorAtom, violations.map(v => v.message).join('; '))
      return false
    }
    s.set(GtdStore.docAtom, next)
    s.set(GtdStore.errorAtom, null)
    GtdStore.scheduleSave()
    return true
  }

  private static cancelSave(): void {
    if (GtdStore.saveTimer) {
      clearTimeout(GtdStore.saveTimer)
      GtdStore.saveTimer = null
    }
  }

  private static scheduleSave(): void {
    GtdStore.cancelSave()
    GtdStore.saveTimer = setTimeout(() => {
      GtdStore.saveTimer = null
      void GtdStore.flushSave()
    }, SAVE_DEBOUNCE_MS)
  }

  static async flushSave(): Promise<void> {
    const s = GtdStore.store()
    const userId = s.get(GtdStore.userIdAtom)
    if (!userId)
      return
    const document = s.get(GtdStore.docAtom)
    s.set(GtdStore.savingAtom, true)
    try {
      await GtdApi.saveDocument(document)
      GtdStore.snapshotBeforeMutate = null
      s.set(GtdStore.errorAtom, null)
    }
    catch (e) {
      if (GtdStore.snapshotBeforeMutate)
        s.set(GtdStore.docAtom, GtdStore.snapshotBeforeMutate)
      s.set(GtdStore.errorAtom, e instanceof Error ? e.message : String(e))
    }
    finally {
      s.set(GtdStore.savingAtom, false)
    }
  }

  // ---------- Tasks ----------

  static addInboxTask(name: string): void {
    const trimmed = name.trim()
    if (!trimmed)
      return
    GtdStore.applyLocal((doc) => {
      const now = nowIso()
      const task: Task = {
        id: newId(),
        name: trimmed,
        note: null,
        projectId: null,
        parentId: null,
        order: nextOrder(doc.tasks.filter(t => t.projectId == null && t.parentId == null)),
        status: 'active',
        groupType: null,
        deferDate: null,
        dueDate: null,
        completedAt: null,
        droppedAt: null,
        flagged: false,
        estimateMinutes: null,
        repeatRuleId: null,
        tagIds: [],
        attachmentIds: [],
        repeatedFromTaskId: null,
        createdAt: now,
        updatedAt: now,
      }
      return { ...doc, tasks: [...doc.tasks, task] }
    })
  }

  static addProjectTask(projectId: string, name: string): void {
    const trimmed = name.trim()
    if (!trimmed)
      return
    GtdStore.applyLocal((doc) => {
      const now = nowIso()
      const siblings = doc.tasks.filter(t => t.projectId === projectId && t.parentId == null)
      const task: Task = {
        id: newId(),
        name: trimmed,
        note: null,
        projectId,
        parentId: null,
        order: nextOrder(siblings),
        status: 'active',
        groupType: null,
        deferDate: null,
        dueDate: null,
        completedAt: null,
        droppedAt: null,
        flagged: false,
        estimateMinutes: null,
        repeatRuleId: null,
        tagIds: [],
        attachmentIds: [],
        repeatedFromTaskId: null,
        createdAt: now,
        updatedAt: now,
      }
      return { ...doc, tasks: [...doc.tasks, task] }
    })
  }

  static addChildTask(parentId: string, name: string): void {
    const trimmed = name.trim()
    if (!trimmed)
      return
    GtdStore.applyLocal((doc) => {
      const parent = doc.tasks.find(t => t.id === parentId)
      if (!parent)
        throw new Error('父任务不存在')
      if (!parent.projectId)
        throw new Error('Inbox 任务需先移入项目，才能添加子任务')
      const now = nowIso()
      const children = doc.tasks.filter(t => t.parentId === parentId)
      const task: Task = {
        id: newId(),
        name: trimmed,
        note: null,
        projectId: parent.projectId,
        parentId,
        order: nextOrder(children),
        status: EXPLICIT_STATUS.ACTIVE,
        groupType: null,
        deferDate: null,
        dueDate: null,
        completedAt: null,
        droppedAt: null,
        flagged: false,
        estimateMinutes: null,
        repeatRuleId: null,
        tagIds: [],
        attachmentIds: [],
        repeatedFromTaskId: null,
        createdAt: now,
        updatedAt: now,
      }
      return {
        ...doc,
        tasks: [
          ...doc.tasks.map(t =>
            t.id === parentId && !t.groupType
              ? { ...t, groupType: GROUP_TYPE.PARALLEL, updatedAt: now }
              : t,
          ),
          task,
        ],
      }
    })
  }

  static indentTask(taskId: string): void {
    GtdStore.applyLocal((doc) => {
      const task = doc.tasks.find(t => t.id === taskId)
      if (!task)
        throw new Error('任务不存在')
      if (!task.projectId)
        throw new Error('Inbox 任务不能缩进')
      const siblings = sortedByOrder(doc.tasks.filter(t =>
        t.projectId === task.projectId && t.parentId === task.parentId,
      ))
      const index = siblings.findIndex(t => t.id === taskId)
      const parent = index > 0 ? siblings[index - 1] : null
      if (!parent)
        throw new Error('当前任务前面没有可作为父级的任务')
      const now = nowIso()
      const children = doc.tasks.filter(t => t.parentId === parent.id && t.id !== taskId)
      return {
        ...doc,
        tasks: doc.tasks.map((item) => {
          if (item.id === parent.id) {
            return {
              ...item,
              groupType: item.groupType ?? GROUP_TYPE.PARALLEL,
              updatedAt: now,
            }
          }
          if (item.id === taskId) {
            return {
              ...item,
              parentId: parent.id,
              projectId: parent.projectId,
              order: nextOrder(children),
              updatedAt: now,
            }
          }
          return item
        }),
      }
    })
  }

  static outdentTask(taskId: string): void {
    GtdStore.applyLocal((doc) => {
      const task = doc.tasks.find(t => t.id === taskId)
      const parent = task?.parentId
        ? doc.tasks.find(t => t.id === task.parentId)
        : null
      if (!task || !parent)
        throw new Error('当前任务已经是项目顶层任务')
      const parentSiblings = sortedByOrder(doc.tasks.filter(t =>
        t.projectId === parent.projectId && t.parentId === parent.parentId && t.id !== taskId,
      ))
      const parentIndex = parentSiblings.findIndex(t => t.id === parent.id)
      const after = parentIndex >= 0 ? parentSiblings[parentIndex + 1] ?? null : null
      const remainingChildren = doc.tasks.filter(t =>
        t.parentId === parent.id && t.id !== taskId,
      )
      const now = nowIso()
      return {
        ...doc,
        tasks: doc.tasks.map((item) => {
          if (item.id === taskId) {
            return {
              ...item,
              parentId: parent.parentId,
              projectId: parent.projectId,
              order: orderBetween(parent.order, after?.order ?? null),
              updatedAt: now,
            }
          }
          if (item.id === parent.id && remainingChildren.length === 0) {
            return { ...item, groupType: null, updatedAt: now }
          }
          return item
        }),
      }
    })
  }

  static setTaskGroupType(taskId: string, type: GroupType | null): void {
    GtdStore.applyLocal((doc) => {
      const hasChildren = doc.tasks.some(t => t.parentId === taskId)
      if (hasChildren && type == null)
        throw new Error('有子任务的任务组不能转换为普通任务')
      return {
        ...doc,
        tasks: doc.tasks.map(t =>
          t.id === taskId ? { ...t, groupType: type, updatedAt: nowIso() } : t,
        ),
      }
    })
  }

  static reorderTask(
    taskId: string,
    target: { beforeId: string | null, afterId: string | null },
  ): void {
    GtdStore.applyLocal((doc) => {
      const task = doc.tasks.find(t => t.id === taskId)
      if (!task)
        throw new Error('任务不存在')
      const siblings = doc.tasks.filter(t =>
        t.id !== taskId
        && t.projectId === task.projectId
        && t.parentId === task.parentId,
      )
      const result = targetOrder(siblings, target.beforeId, target.afterId)
      return {
        ...doc,
        tasks: doc.tasks.map((t) => {
          if (t.id === taskId)
            return { ...t, order: result.order, updatedAt: nowIso() }
          const order = result.reindexed.get(t.id)
          return order == null ? t : { ...t, order, updatedAt: nowIso() }
        }),
      }
    })
  }

  static completeTask(taskId: string): void {
    GtdStore.applyLocal(doc => complete(doc, taskId, new Date()))
  }

  static dropTask(taskId: string): void {
    GtdStore.applyLocal(doc => drop(doc, taskId, new Date()))
  }

  static reopenTask(taskId: string): void {
    GtdStore.applyLocal(doc => reopen(doc, taskId))
  }

  static restoreTask(taskId: string): void {
    GtdStore.applyLocal(doc => restore(doc, taskId))
  }

  static deleteTaskLogical(taskId: string): void {
    GtdStore.applyLocal(doc => deleteTask(doc, taskId, new Date()))
  }

  static toggleFlag(taskId: string): void {
    GtdStore.applyLocal(doc => ({
      ...doc,
      tasks: doc.tasks.map(t =>
        t.id === taskId
          ? { ...t, flagged: !t.flagged, updatedAt: nowIso() }
          : t,
      ),
    }))
  }

  static patchTask(taskId: string, patch: Partial<Task>): void {
    GtdStore.applyLocal((doc) => {
      const task = doc.tasks.find(t => t.id === taskId)
      const rule = task?.repeatRuleId
        ? doc.repeatRules.find(item => item.id === task.repeatRuleId)
        : null
      if (rule?.anchor === REPEAT_ANCHOR.DUE && patch.dueDate === null)
        throw new Error('按截止日重复的任务不能清空截止日期')
      if (rule?.anchor === REPEAT_ANCHOR.DEFER && patch.deferDate === null)
        throw new Error('按推迟日重复的任务不能清空推迟日期')
      return {
        ...doc,
        tasks: doc.tasks.map(t =>
          t.id === taskId
            ? { ...t, ...patch, id: t.id, updatedAt: nowIso() }
            : t,
        ),
      }
    })
  }

  static setTaskRepeat(taskId: string, input: RepeatRuleInput | null): void {
    GtdStore.applyLocal((doc) => {
      const task = doc.tasks.find(t => t.id === taskId)
      if (!task)
        throw new Error('任务不存在')
      if (input?.anchor === REPEAT_ANCHOR.DUE && !task.dueDate)
        throw new Error('按截止日重复前，请先设置截止日期')
      if (input?.anchor === REPEAT_ANCHOR.DEFER && !task.deferDate)
        throw new Error('按推迟日重复前，请先设置推迟日期')

      if (!input) {
        const repeatRuleId = task.repeatRuleId
        const tasks = doc.tasks.map(t =>
          t.id === taskId ? { ...t, repeatRuleId: null, updatedAt: nowIso() } : t,
        )
        const stillUsed = repeatRuleId
          ? tasks.some(t => t.repeatRuleId === repeatRuleId)
          : false
        return {
          ...doc,
          tasks,
          repeatRules: stillUsed
            ? doc.repeatRules
            : doc.repeatRules.filter(rule => rule.id !== repeatRuleId),
        }
      }

      const existing = task.repeatRuleId
        ? doc.repeatRules.find(rule => rule.id === task.repeatRuleId)
        : null
      const shared = existing
        ? doc.tasks.some(t => t.id !== taskId && t.repeatRuleId === existing.id)
        : false
      const id = existing && !shared ? existing.id : newId()
      const rule: RepeatRule = {
        ...input,
        id,
        completedOccurrences: existing?.completedOccurrences ?? 0,
      }
      return {
        ...doc,
        repeatRules: [
          ...doc.repeatRules.filter(item => item.id !== id),
          rule,
        ],
        tasks: doc.tasks.map(t =>
          t.id === taskId ? { ...t, repeatRuleId: id, updatedAt: nowIso() } : t,
        ),
      }
    })
  }

  // ---------- Perspectives ----------

  static addPerspective(input: PerspectiveInput): boolean {
    return GtdStore.applyLocal((doc) => {
      const result = validatePerspectiveInput(
        input,
        perspectiveValidationContext(doc),
        { mode: 'persist' },
      )
      if (!result.ok)
        throw new Error(result.errors.map(error => error.message).join('; '))
      const now = nowIso()
      const perspective: Perspective = {
        id: newId(),
        name: result.value.name!,
        icon: result.value.icon ?? null,
        matchMode: result.value.matchMode,
        filterRules: toPerspectiveFilterRules(result.value.filterRules),
        groupBy: result.value.groupBy,
        sortBy: result.value.sortBy,
        availabilityFilter: result.value.availabilityFilter,
        showCompleted: result.value.showCompleted,
        showDropped: result.value.showDropped,
        flaggedOnly: result.value.flaggedOnly,
        createdAt: now,
        updatedAt: null,
      }
      return { ...doc, perspectives: [...doc.perspectives, perspective] }
    })
  }

  static patchPerspective(id: string, input: PerspectiveInput): boolean {
    return GtdStore.applyLocal((doc) => {
      if (!doc.perspectives.some(p => p.id === id))
        throw new Error('自定义透视不存在')
      const result = validatePerspectiveInput(
        input,
        perspectiveValidationContext(doc),
        { mode: 'persist', perspectiveId: id },
      )
      if (!result.ok)
        throw new Error(result.errors.map(error => error.message).join('; '))
      return {
        ...doc,
        perspectives: doc.perspectives.map(p =>
          p.id === id
            ? {
                ...p,
                name: result.value.name!,
                icon: result.value.icon ?? null,
                matchMode: result.value.matchMode,
                filterRules: toPerspectiveFilterRules(result.value.filterRules),
                groupBy: result.value.groupBy,
                sortBy: result.value.sortBy,
                availabilityFilter: result.value.availabilityFilter,
                showCompleted: result.value.showCompleted,
                showDropped: result.value.showDropped,
                flaggedOnly: result.value.flaggedOnly,
                updatedAt: nowIso(),
              }
            : p,
        ),
      }
    })
  }

  static removePerspective(id: string): void {
    const s = GtdStore.store()
    GtdStore.applyLocal(doc => ({
      ...doc,
      perspectives: doc.perspectives.filter(p => p.id !== id),
    }))
    const selection = s.get(GtdStore.selectionAtom)
    if (selection.kind === 'perspective' && selection.id === id)
      GtdStore.setSelection({ kind: 'perspective', id: 'inbox' })
  }

  // ---------- Projects ----------

  static addProject(name: string, folderId: string | null = null): void {
    const trimmed = name.trim()
    if (!trimmed)
      return
    GtdStore.applyLocal((doc) => {
      const now = nowIso()
      const project: Project = {
        id: newId(),
        name: trimmed,
        note: null,
        folderId,
        order: nextOrder(doc.projects.filter(p => p.folderId === folderId)),
        status: 'active',
        type: GROUP_TYPE.SEQUENTIAL,
        defaultDeferOffset: null,
        defaultDueOffset: null,
        defaultTagIds: [],
        flagged: false,
        review: {
          enabled: true,
          interval: REVIEW_INTERVAL.WEEKLY,
          customDays: null,
          lastReviewDate: null,
          nextReviewDate: now,
          needsReview: false,
        },
        createdAt: now,
        updatedAt: now,
      }
      return { ...doc, projects: [...doc.projects, project] }
    })
  }

  static patchProject(projectId: string, patch: Partial<Project>): void {
    GtdStore.applyLocal(doc => ({
      ...doc,
      projects: doc.projects.map(p =>
        p.id === projectId
          ? { ...p, ...patch, id: p.id, updatedAt: nowIso() }
          : p,
      ),
    }))
  }

  static holdProject(projectId: string): void {
    GtdStore.applyLocal(doc => hold(doc, projectId))
  }

  static resumeProject(projectId: string): void {
    GtdStore.applyLocal(doc => resume(doc, projectId))
  }

  static markProjectReviewed(projectId: string): void {
    GtdStore.applyLocal(doc => markReviewed(doc, projectId, new Date()))
  }

  static removeProject(projectId: string): void {
    GtdStore.applyLocal((doc) => {
      const removedTasks = doc.tasks.filter(t => t.projectId === projectId)
      const taskIds = new Set(removedTasks.map(t => t.id))
      const remainingTasks = doc.tasks.filter(t => t.projectId !== projectId)
      const usedRuleIds = new Set(
        remainingTasks.map(t => t.repeatRuleId).filter((id): id is string => id != null),
      )
      return {
        ...doc,
        projects: doc.projects.filter(p => p.id !== projectId),
        tasks: remainingTasks,
        attachments: doc.attachments.filter(a => !taskIds.has(a.taskId)),
        repeatRules: doc.repeatRules.filter(r => usedRuleIds.has(r.id)),
      }
    })
  }

  static reorderProject(
    projectId: string,
    target: { beforeId: string | null, afterId: string | null },
  ): void {
    GtdStore.applyLocal((doc) => {
      const project = doc.projects.find(p => p.id === projectId)
      if (!project)
        throw new Error('项目不存在')
      const siblings = doc.projects.filter(p =>
        p.id !== projectId && p.folderId === project.folderId,
      )
      const result = targetOrder(siblings, target.beforeId, target.afterId)
      return {
        ...doc,
        projects: doc.projects.map((p) => {
          if (p.id === projectId)
            return { ...p, order: result.order, updatedAt: nowIso() }
          const order = result.reindexed.get(p.id)
          return order == null ? p : { ...p, order, updatedAt: nowIso() }
        }),
      }
    })
  }

  // ---------- Tags ----------

  static addTag(name: string, parentId: string | null = null): void {
    const trimmed = name.trim()
    if (!trimmed)
      return
    GtdStore.applyLocal((doc) => {
      const now = nowIso()
      const tag: Tag = {
        id: newId(),
        name: trimmed,
        parentId,
        order: nextOrder(doc.tags.filter(t => t.parentId === parentId)),
        color: null,
        createdAt: now,
        updatedAt: null,
      }
      return { ...doc, tags: [...doc.tags, tag] }
    })
  }

  static patchTag(tagId: string, patch: Partial<Tag>): void {
    GtdStore.applyLocal(doc => ({
      ...doc,
      tags: doc.tags.map(t =>
        t.id === tagId
          ? { ...t, ...patch, id: t.id, updatedAt: nowIso() }
          : t,
      ),
    }))
  }

  static removeTag(tagId: string): void {
    GtdStore.applyLocal((doc) => {
      const removeIds = new Set<string>()
      const collect = (id: string) => {
        removeIds.add(id)
        for (const t of doc.tags) {
          if (t.parentId === id)
            collect(t.id)
        }
      }
      collect(tagId)
      return {
        ...doc,
        tags: doc.tags.filter(t => !removeIds.has(t.id)),
        tasks: doc.tasks.map(t => ({
          ...t,
          tagIds: t.tagIds.filter(id => !removeIds.has(id)),
        })),
        projects: doc.projects.map(p => ({
          ...p,
          defaultTagIds: p.defaultTagIds.filter(id => !removeIds.has(id)),
        })),
      }
    })
  }

  static reorderTag(
    tagId: string,
    target: { beforeId: string | null, afterId: string | null },
  ): void {
    GtdStore.applyLocal((doc) => {
      const tag = doc.tags.find(t => t.id === tagId)
      if (!tag)
        throw new Error('标签不存在')
      const siblings = doc.tags.filter(t =>
        t.id !== tagId && t.parentId === tag.parentId,
      )
      const result = targetOrder(siblings, target.beforeId, target.afterId)
      return {
        ...doc,
        tags: doc.tags.map((t) => {
          if (t.id === tagId)
            return { ...t, order: result.order, updatedAt: nowIso() }
          const order = result.reindexed.get(t.id)
          return order == null ? t : { ...t, order, updatedAt: nowIso() }
        }),
      }
    })
  }

  // ---------- Folders ----------

  static addFolder(name: string, parentId: string | null = null): void {
    const trimmed = name.trim()
    if (!trimmed)
      return
    GtdStore.applyLocal((doc) => {
      const now = nowIso()
      const folder: Folder = {
        id: newId(),
        name: trimmed,
        parentId,
        order: nextOrder(doc.folders.filter(f => f.parentId === parentId)),
        status: FOLDER_STATUS.ACTIVE,
        createdAt: now,
        updatedAt: null,
      }
      return { ...doc, folders: [...doc.folders, folder] }
    })
  }

  static reorderFolder(
    folderId: string,
    target: { beforeId: string | null, afterId: string | null },
  ): void {
    GtdStore.applyLocal((doc) => {
      const folder = doc.folders.find(f => f.id === folderId)
      if (!folder)
        throw new Error('文件夹不存在')
      const siblings = doc.folders.filter(f =>
        f.id !== folderId && f.parentId === folder.parentId,
      )
      const result = targetOrder(siblings, target.beforeId, target.afterId)
      return {
        ...doc,
        folders: doc.folders.map((f) => {
          if (f.id === folderId)
            return { ...f, order: result.order, updatedAt: nowIso() }
          const order = result.reindexed.get(f.id)
          return order == null ? f : { ...f, order, updatedAt: nowIso() }
        }),
      }
    })
  }
}
