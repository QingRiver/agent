import type {
  CompleteCommand,
  DeleteFolderCommand,
  DeleteMutation,
  DeleteProjectCommand,
  DeleteTagCommand,
  DropCommand,
  EntityRow,
  EntityRowOf,
  GtdCommand,
  GtdMutation,
  MoveCommand,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncEntity,
  UpsertMutation,
} from './sync-schema'
/**
 * GTD 多端同步核心：服务端权威 + 属性级 patch 列合并（后写赢 LWW）。
 *
 * 行模型 EntityRow 贯通 Client / wire / Postgres（同形），GtdDocument 仅作导入导出边界。
 * 类型全部从 `./sync-schema` 的 Zod 派生（单一事实源）；EntityRow.data 按 entity 收窄
 * （EntityDataOf<E>），联合类型 + ts-pattern 模式匹配收窄，消 Record<string,unknown> 与 as cast。
 * 违规 throw Error，由 radash tryit 捕获入 rejected（不分配 syncId、不阻塞后续）。
 * HTTP handler 在 apps/server 薄包装；持久化由 sync-repository 落 Postgres。
 */
import { tryit } from 'radash'
import { match } from 'ts-pattern'
import { computeNextDates, shouldStop } from './repeat'
import { EXPLICIT_STATUS } from './types'

// re-export wire 契约（sync.ts 是 sync 模块入口）
export type {
  CompleteCommand,
  DeleteFolderCommand,
  DeleteMutation,
  DeleteProjectCommand,
  DeleteTagCommand,
  DropCommand,
  EntityDataOf,
  EntityRow,
  EntityRowOf,
  GtdCommand,
  GtdMutation,
  MoveCommand,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncEntity,
  UpsertMutation,
} from './sync-schema'

/** 服务端某用户的同步状态（applyPush 的输入真相；内部，非 wire）。 */
export interface SyncState {
  userId: string
  /** 该用户已分配的最大 syncId；下一个分配值 = clock + 1。 */
  clock: number
  rows: EntityRow[]
  /** 已处理的 mutation/command.id（幂等去重）。 */
  processedIds: Set<string>
}

export interface ApplyPushResult {
  response: PushResponse
  /** apply 后的新状态（含新 clock、新行、processedIds 更新）。 */
  state: SyncState
}

/** apply 成功结果：'applied' 已落库 | 'noop' 幂等无操作；违规走异常通道由 applyPush 捕获。 */
export type ApplyResult = 'applied' | 'noop'

/** 按 entity 收窄查找未软删行；未找到返回 undefined。 */
function findLive<E extends SyncEntity>(
  rows: EntityRow[],
  entity: E,
  id: string,
): EntityRowOf<E> | undefined {
  return rows.find(r => r.entity === entity && r.id === id && !r.deleted) as EntityRowOf<E> | undefined
}

/**
 * 拉取增量：返回 state 中 syncId > lastSyncId 的所有行（含软删行）。纯函数，不改 state。
 */
export function pull(state: SyncState, lastSyncId: number): PullResponse {
  const changes = state.rows.filter(r => r.syncId > lastSyncId)
  return { changes, serverSyncId: state.clock }
}

/**
 * 应用一次 push：先处理 commands（高风险权威命令），再处理 mutations（patch 列合并）。
 * 每条独立 tryit 捕获：违规入 rejected，不分配 syncId、不阻塞后续；applied/noop/幂等重放都 ack。
 */
export function applyPush(state: SyncState, req: PushRequest): ApplyPushResult {
  const userId = state.userId
  let clock = state.clock
  // 深拷贝行：row 新对象 + data 浅拷贝（patch 只改顶层列，不嵌套 mutate）
  const rows: EntityRow[] = state.rows.map(r => ({ ...r, data: { ...r.data } }) as EntityRow)
  const processedIds = new Set(state.processedIds)
  const applied: string[] = []
  const rejected: PushResponse['rejected'] = []

  const nextSyncId = (): number => {
    clock += 1
    return clock
  }

  // 1. commands（高风险权威命令，先于 mutations）
  const tryCmd = tryit((cmd: GtdCommand) => applyCommand(cmd, rows, nextSyncId))
  for (const cmd of req.commands) {
    if (processedIds.has(cmd.id)) {
      applied.push(cmd.id) // 幂等重放：已处理过，确认 ack 让客户端清 outbox
      continue
    }
    const [err] = tryCmd(cmd)
    if (err) {
      rejected.push({ id: cmd.id, reason: err.message })
    }
    else {
      processedIds.add(cmd.id) // applied/noop 均视为已处理
      applied.push(cmd.id)
    }
  }

  // 2. mutations（patch 列合并）
  const tryMut = tryit((mut: GtdMutation) => applyMutation(mut, rows, userId, nextSyncId))
  for (const mut of req.mutations) {
    if (processedIds.has(mut.id)) {
      applied.push(mut.id)
      continue
    }
    const [err] = tryMut(mut)
    if (err) {
      rejected.push({ id: mut.id, reason: err.message })
    }
    else {
      processedIds.add(mut.id)
      applied.push(mut.id)
    }
  }

  const changes = rows.filter(r => r.syncId > req.lastSyncId)
  return {
    response: { applied, rejected, changes, serverSyncId: clock },
    state: { userId, clock, rows, processedIds },
  }
}

// ---------------- commands ----------------

function applyCommand(
  cmd: GtdCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  return match(cmd)
    .with({ type: 'complete' }, c => applyComplete(c, rows, nextSyncId))
    .with({ type: 'drop' }, c => applyDrop(c, rows, nextSyncId))
    .with({ type: 'move' }, c => applyMove(c, rows, nextSyncId))
    .with({ type: 'delete_folder' }, c => applyDeleteFolder(c, rows, nextSyncId))
    .with({ type: 'delete_project' }, c => applyDeleteProject(c, rows, nextSyncId))
    .with({ type: 'delete_tag' }, c => applyDeleteTag(c, rows, nextSyncId))
    .exhaustive()
}

/** complete + repeat：旧任务终态 + （若重复）克隆下一实例，id 复用 clientGenerated.nextTaskId。 */
function applyComplete(
  cmd: CompleteCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const taskId = cmd.taskId
  const task = findLive(rows, 'task', taskId)
  if (!task) {
    throw new Error(`task ${taskId} not found`)
  }
  // 状态机：仅 active 可 complete；completed 幂等 noop；其他终态（cancelled/deleted/on_hold）拒绝
  const status = task.data.status
  if (status === EXPLICIT_STATUS.COMPLETED) {
    return 'noop'
  }
  if (status !== EXPLICIT_STATUS.ACTIVE) {
    throw new Error(`task ${taskId} not active (current: ${String(status)})`)
  }

  // repeat 克隆预校验（事务性：校验失败则整 command 不分配 syncId）
  // repeatRule 内联在 task.data.repeatRule（DB 行 jsonb 视角；Task schema 无此字段，DB 层 1:1 内联）
  const repeatRuleId = task.data.repeatRuleId
  const rule = repeatRuleId != null ? task.data.repeatRule : undefined
  const now = new Date(cmd.clientTs)
  // shouldStop / 无 rule 内容 → 不克隆（repeat 终止）
  const willClone = repeatRuleId != null && rule != null && !shouldStop(rule, now)

  let nextTaskId: string | null = null
  let reviveExisting: EntityRow | null = null
  if (willClone) {
    const proposedNextId = cmd.clientGenerated?.nextTaskId
    if (!proposedNextId) {
      throw new Error(`repeat task ${taskId} missing clientGenerated.nextTaskId`)
    }
    nextTaskId = proposedNextId
    /** 已占用 nextTaskId 的 task 行（含软删，用于冲突检测 / 同源复活）。 */
    const existingNextTask = rows.find((r): r is EntityRowOf<'task'> =>
      r.entity === 'task' && r.id === nextTaskId)
    if (existingNextTask) {
      if (existingNextTask.data.repeatedFromTaskId !== taskId) {
        throw new Error(`nextTaskId ${nextTaskId} occupied by different source`)
      }
      if (existingNextTask.deleted) {
        // 同源已软删 → 重新克隆复活（覆盖 existingNextTask，丢其旧修改）
        reviveExisting = existingNextTask
      }
      else {
        // 同源未删 → 幂等重放，不创建新实例（旧任务仍 complete）
        nextTaskId = null
      }
    }
  }

  // apply：旧任务终态 + repeatRule completedOccurrences++（仅克隆时；shouldStop/幂等不++）
  task.data.status = EXPLICIT_STATUS.COMPLETED
  task.data.completedAt = cmd.clientTs
  if (nextTaskId && rule) {
    task.data.repeatRule = { ...rule, completedOccurrences: rule.completedOccurrences + 1 }
  }
  task.syncId = nextSyncId()

  // 克隆下一实例（id 复用客户端提议；算下一期日期；复制 task_tag）
  if (nextTaskId && rule) {
    const next = computeNextDates(rule, task.data, now)
    const newTaskData = {
      ...task.data,
      id: nextTaskId, // 覆盖 data.id：task.data 含旧 id，新实例要用新 id
      status: EXPLICIT_STATUS.ACTIVE,
      completedAt: null,
      droppedAt: null,
      deferDate: next.deferDate,
      dueDate: next.dueDate,
      repeatedFromTaskId: taskId,
      createdAt: cmd.clientTs,
      updatedAt: cmd.clientTs,
    }
    if (reviveExisting) {
      reviveExisting.deleted = false
      reviveExisting.data = newTaskData
      reviveExisting.syncId = nextSyncId()
    }
    else {
      rows.push({
        entity: 'task',
        id: nextTaskId,
        userId: task.userId,
        syncId: nextSyncId(),
        deleted: false,
        data: newTaskData,
      })
    }

    // 复制旧实例 task_tag → 新实例（保持标签继承）
    /** 旧实例上未软删的 task_tag，用于复制到新实例。 */
    const sourceTaskTags = rows.filter((r): r is EntityRowOf<'task_tag'> =>
      r.entity === 'task_tag' && r.data.taskId === taskId && !r.deleted)
    for (const tt of sourceTaskTags) {
      const tagId = tt.data.tagId
      if (typeof tagId !== 'string') {
        continue
      }
      const newTagRowId = `${nextTaskId}|${tagId}`
      if (rows.some(r => r.entity === 'task_tag' && r.id === newTagRowId)) {
        continue // 复活场景已有则跳过
      }
      rows.push({
        entity: 'task_tag',
        id: newTagRowId,
        userId: task.userId,
        syncId: nextSyncId(),
        deleted: false,
        data: { taskId: nextTaskId, tagId },
      })
    }
  }

  return 'applied'
}

/** drop：旧任务置 cancelled 终态（droppedAt 字段记时间）。 */
function applyDrop(
  cmd: DropCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const taskId = cmd.taskId
  const task = findLive(rows, 'task', taskId)
  if (!task) {
    throw new Error(`task ${taskId} not found`)
  }
  // 状态机：仅 active 可 drop；cancelled 幂等 noop；其他终态（completed/deleted/on_hold）拒绝
  const status = task.data.status
  if (status === EXPLICIT_STATUS.CANCELLED) {
    return 'noop'
  }
  if (status !== EXPLICIT_STATUS.ACTIVE) {
    throw new Error(`task ${taskId} not active (current: ${String(status)})`)
  }
  task.data.status = EXPLICIT_STATUS.CANCELLED
  task.data.droppedAt = cmd.clientTs
  task.syncId = nextSyncId()
  return 'applied'
}

/** move：改 task 的 projectId/parentId/order（引用校验）。 */
function applyMove(
  cmd: MoveCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const taskId = cmd.taskId
  const task = findLive(rows, 'task', taskId)
  if (!task) {
    throw new Error(`task ${taskId} not found`)
  }
  const { projectId, parentId, order } = cmd.payload
  if (projectId != null && !findLive(rows, 'project', projectId)) {
    throw new Error(`project ${projectId} not found`)
  }
  if (parentId != null && !findLive(rows, 'task', parentId)) {
    throw new Error(`parent task ${parentId} not found`)
  }
  task.data.projectId = projectId
  task.data.parentId = parentId
  task.data.order = order
  task.syncId = nextSyncId()
  return 'applied'
}

/** delete_folder：软删 folder + 其下 project folderId 置 null（各推进 syncId）。 */
function applyDeleteFolder(
  cmd: DeleteFolderCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const { folderId } = cmd.payload
  const folder = findLive(rows, 'folder', folderId)
  if (!folder) {
    throw new Error(`folder ${folderId} not found`)
  }
  folder.deleted = true
  folder.syncId = nextSyncId()
  for (const r of rows) {
    if (r.entity === 'project' && r.data.folderId === folderId && !r.deleted) {
      r.data.folderId = null
      r.syncId = nextSyncId()
    }
  }
  return 'applied'
}

/** delete_project：软删 project + 递归软删子 task 子树（各推进 syncId）。 */
function applyDeleteProject(
  cmd: DeleteProjectCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const { projectId } = cmd.payload
  const project = findLive(rows, 'project', projectId)
  if (!project) {
    throw new Error(`project ${projectId} not found`)
  }
  project.deleted = true
  project.syncId = nextSyncId()

  /** 当前未软删的 task 行，用于级联算出待删子树。 */
  const liveTasks = rows.filter((r): r is EntityRowOf<'task'> =>
    r.entity === 'task' && !r.deleted)
  const toDelete = new Set<string>()
  for (const t of liveTasks) {
    if (t.data.projectId === projectId) {
      toDelete.add(t.id)
    }
  }
  // 递归：parentId 在删除集合的子 task
  let changed = true
  while (changed) {
    changed = false
    for (const t of liveTasks) {
      const parentId = t.data.parentId
      if (!toDelete.has(t.id) && typeof parentId === 'string' && toDelete.has(parentId)) {
        toDelete.add(t.id)
        changed = true
      }
    }
  }
  for (const t of liveTasks) {
    if (toDelete.has(t.id)) {
      t.deleted = true
      t.syncId = nextSyncId()
    }
  }
  return 'applied'
}

/** delete_tag：软删 tag + 软删所有该 tagId 的 task_tag 关联行（各推进 syncId）。 */
function applyDeleteTag(
  cmd: DeleteTagCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const { tagId } = cmd.payload
  const tag = findLive(rows, 'tag', tagId)
  if (!tag) {
    throw new Error(`tag ${tagId} not found`)
  }
  tag.deleted = true
  tag.syncId = nextSyncId()
  for (const r of rows) {
    if (r.entity === 'task_tag' && r.data.tagId === tagId && !r.deleted) {
      r.deleted = true
      r.syncId = nextSyncId()
    }
  }
  return 'applied'
}

// ---------------- mutations ----------------

function applyMutation(
  mut: GtdMutation,
  rows: EntityRow[],
  userId: string,
  nextSyncId: () => number,
): ApplyResult {
  return match(mut)
    .with({ op: 'delete' }, m => applyMutationDelete(m, rows, nextSyncId))
    .with({ op: 'upsert' }, m => applyMutationUpsert(m, rows, userId, nextSyncId))
    .exhaustive()
}

/** delete op：软删行（找不到 → throw，已软删 → noop）。 */
function applyMutationDelete(
  mut: DeleteMutation,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const row = rows.find(r => r.entity === mut.entity && r.id === mut.entityId)
  if (!row) {
    throw new Error(`${mut.entity} ${mut.entityId} not found`)
  }
  if (row.deleted) {
    return 'noop'
  }
  row.deleted = true
  row.syncId = nextSyncId()
  return 'applied'
}

/** upsert op：先引用校验，再 patch 列合并；命中软删行则复活。 */
function applyMutationUpsert(
  mut: UpsertMutation,
  rows: EntityRow[],
  userId: string,
  nextSyncId: () => number,
): ApplyResult {
  assertMutationPatch(mut, rows)

  const patch = mut.patch ?? {}
  const row = rows.find(r => r.entity === mut.entity && r.id === mut.entityId)
  if (row) {
    // patch 列合并：只覆盖 patch 提及的列，未提及列不动
    row.data = { ...row.data, ...patch } as typeof row.data
    row.deleted = false // upsert 复活软删实体（创建意图按到达序胜过删除）
    row.syncId = nextSyncId()
  }
  else {
    rows.push({
      entity: mut.entity,
      id: mut.entityId,
      userId,
      syncId: nextSyncId(),
      deleted: false,
      data: { ...patch },
    } as EntityRow)
  }
  return 'applied'
}

/**
 * 普通字段 upsert 的引用完整性校验（projectId/parentId/taskId/tagId 存在且未软删）；违规 throw。
 * ts-pattern 按 entity 模式匹配收窄 patch 类型，字段直接 string，无需 cast。
 */
function assertMutationPatch(mut: UpsertMutation, rows: EntityRow[]): void {
  void match(mut)
    .with({ entity: 'task' }, (m) => {
      const patch = m.patch ?? {}
      const { projectId, parentId } = patch
      if (projectId != null && !findLive(rows, 'project', projectId)) {
        throw new Error(`project ${projectId} not found`)
      }
      if (parentId != null && !findLive(rows, 'task', parentId)) {
        throw new Error(`parent task ${parentId} not found`)
      }
    })
    .with({ entity: 'task_tag' }, (m) => {
      const { taskId, tagId } = m.patch
      if (!findLive(rows, 'task', taskId)) {
        throw new Error(`task ${taskId} not found`)
      }
      if (!findLive(rows, 'tag', tagId)) {
        throw new Error(`tag ${tagId} not found`)
      }
    })
    .otherwise(() => {
      // 其他 entity upsert：暂不校验引用（原型可接受，接 HTTP 前补 project.folderId 等）
    })
}
