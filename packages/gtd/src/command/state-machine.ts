/**
 * 任务状态机（L5 command）：complete / drop / reopen / restore / deleteTask 的纯函数实现。
 *
 * 各函数接收 cmd + rows + nextSyncId，按状态机规则推进任务状态
 * （仅可推进态可推进；同态幂等 noop；异态拒绝 throw），并经 L3 `cascade.ts` 级联
 * （complete/drop/delete **不改子任务自身状态**——子的有效状态跟随父；complete 无需否决（子的有效状态跟随完成）；
 * reopen/restore/restore_from_trash 向上拉回——把链路上**已完成** 祖先翻回活跃，祖先是搁置或删除时不拉回）。
 * complete 重复任务时克隆下一实例。createTask/moveTask/克隆共用 planUpwardActivation 拉回。
 * 纯 rows→rows，不持有状态、不落库；由 `sync/apply.ts` 的 `applyCommand` dispatch 调用。
 *
 * 状态机语义见 `wiki/draft/gtd行为规约.md` SP-STATE-2/3/4/5/6/8。
 */
import type {
  CompleteCommand,
  CreateTaskCommand,
  DeleteTaskCommand,
  DropCommand,
  EntityRow,
  EntityRowOf,
  MoveTaskCommand,
  ReopenCommand,
  RestoreCommand,
  RestoreFromTrashCommand,
  SyncEntity,
} from '../data/sync-schema'
import type { CascadeStep } from '../inheritance/cascade'
import type { TaskTree } from '../structure/tree'
import { EXPLICIT_STATUS, PLANNED_MODE } from '../data/types'
import {
  planDeleteCascade,
  planReopenCascade,
  planRestoreCascade,
  planRestoreFromTrashCascade,
  planUpwardActivation,
} from '../inheritance/cascade'
import { ancestors, buildTaskTree } from '../structure/tree'
import { shouldStop } from '../time/date-math'
import { cloneNextInstance } from './repeat'

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

/** rows → 未软删 task 行列表，供建树。 */
export function liveTasksOf(rows: EntityRow[]): EntityRowOf<'task'>[] {
  return rows.filter((r): r is EntityRowOf<'task'> => r.entity === 'task' && !r.deleted)
}

/**
 * 执行级联计划：逐条 findLive → 翻 status + 按 targetStatus 维护单一终态时间戳一致性 + stamp syncId。
 *
 * 单一终态时间戳不变量：任一时刻三个终态戳（completedAt/heldAt/droppedAt）至多一个非空。
 *   - targetStatus === ACTIVE：三戳全清 null（脱离终态）
 *   - targetStatus === COMPLETED：盖 completedAt = ts，清 heldAt/droppedAt
 *   - targetStatus === HOLD：盖 heldAt = ts，清 completedAt/droppedAt
 *   - targetStatus === DELETED：盖 droppedAt = ts，清 completedAt/heldAt
 *
 * 故时间戳字段由 targetStatus 推导，CascadeStep 无需冗余 tsField。
 * `ts` 为盖戳 ISO 串（通常 cmd.clientTs）。空 steps 为 noop。跳过找不到的行。
 */
export function applySteps(
  rows: EntityRow[],
  steps: CascadeStep[],
  ts: string,
  nextSyncId: () => number,
): void {
  for (const step of steps) {
    const task = findLive(rows, 'task', step.taskId)
    if (!task)
      continue
    task.data.status = step.targetStatus
    if (step.targetStatus === EXPLICIT_STATUS.ACTIVE) {
      task.data.completedAt = null
      task.data.heldAt = null
      task.data.droppedAt = null
    }
    else if (step.targetStatus === EXPLICIT_STATUS.COMPLETED) {
      task.data.completedAt = ts
      task.data.heldAt = null
      task.data.droppedAt = null
    }
    else if (step.targetStatus === EXPLICIT_STATUS.HOLD) {
      task.data.heldAt = ts
      task.data.completedAt = null
      task.data.droppedAt = null
    }
    else {
      // DELETED
      task.data.droppedAt = ts
      task.data.completedAt = null
      task.data.heldAt = null
    }
    task.syncId = nextSyncId()
  }
}

/** complete + repeat：旧任务置完成终态 + （若重复）克隆下一实例。父完成时子的有效状态跟随完成（不改子任务自身状态）——只改自身状态为完成，子有效变完成；无有效活跃直接子，物理不变量自动满足，无需否决。克隆新实例活跃挂同 parentId 下 → planUpwardActivation 拉回已完成祖先。 */
export function completeTask(
  cmd: CompleteCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const taskId = cmd.taskId
  const task = findLive(rows, 'task', taskId)
  if (!task) {
    throw new Error(`task ${taskId} not found`)
  }
  // 状态机：仅 active 可 complete；completed 幂等 noop；其他终态（hold/deleted）拒绝
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

  // 克隆下一实例（id 复用客户端提议；算下一期日期；复制 task_tag）—— 单一实现见 repeat.cloneNextInstance
  if (nextTaskId && rule) {
    cloneNextInstance(task, rule, nextTaskId, reviveExisting, cmd.clientTs, rows, nextSyncId)
    // 缺口二修复：克隆的新实例 active，挂在与原任务同 parentId 下；若该祖先链物理 COMPLETED，
    // 新实例即「活跃子挂已完成父」→ planUpwardActivation 拉回祖先（与 createTask 同路径）。
    // 合法态下 completed 祖先 ∧ active 中间链本身违法不会出现，此处为防御性修复（脏数据/并发遗留）。
    const tree = buildTaskTree(liveTasksOf(rows))
    applySteps(rows, planUpwardActivation(nextTaskId, tree), cmd.clientTs, nextSyncId)
  }

  // 父完成时子有效状态跟随完成：只改自身状态为完成；子的有效状态由 effectiveStatus 派生为完成（不改子任务自身状态）
  return 'applied'
}

/** drop：旧任务置搁置终态。父搁置时子的有效状态跟随搁置（不改子任务自身状态，自身状态保留待 restore 恢复）。 */
export function dropTask(
  cmd: DropCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const taskId = cmd.taskId
  const task = findLive(rows, 'task', taskId)
  if (!task) {
    throw new Error(`task ${taskId} not found`)
  }
  // 状态机：仅 active 可 drop；hold 幂等 noop；其他终态（completed/deleted）拒绝
  const status = task.data.status
  if (status === EXPLICIT_STATUS.HOLD) {
    return 'noop'
  }
  if (status !== EXPLICIT_STATUS.ACTIVE) {
    throw new Error(`task ${taskId} not active (current: ${String(status)})`)
  }
  task.data.status = EXPLICIT_STATUS.HOLD
  task.data.heldAt = cmd.clientTs
  task.syncId = nextSyncId()

  // 父搁置时子有效状态跟随搁置（不改子任务自身状态，自身状态保留待 restore 恢复）
  return 'applied'
}

/**
 * reopen：完成→活跃（清 completedAt）+ 向上拉回（把链路上已完成祖先翻回活跃；祖先是搁置或删除时不拉回）。
 * 仅 completed 可重开；active 幂等 noop；hold/deleted 拒绝。
 * 重复任务（repeatRuleId != null）的 COMPLETED 不可重开（SP-INV-REPEAT-REOPEN）。
 */
export function reopenTask(
  cmd: ReopenCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const taskId = cmd.taskId
  const task = findLive(rows, 'task', taskId)
  if (!task) {
    throw new Error(`task ${taskId} not found`)
  }
  const status = task.data.status
  if (status === EXPLICIT_STATUS.ACTIVE) {
    return 'noop'
  }
  if (status !== EXPLICIT_STATUS.COMPLETED) {
    throw new Error(`task ${taskId} not completed (current: ${String(status)})`)
  }
  if (task.data.repeatRuleId != null) {
    throw new Error(`task ${taskId} is repeating-completed, not reopenable (SP-INV-REPEAT-REOPEN)`)
  }
  const tree: TaskTree = buildTaskTree(liveTasksOf(rows))
  applySteps(rows, planReopenCascade(taskId, tree), cmd.clientTs, nextSyncId)
  return 'applied'
}

/**
 * restore：搁置→活跃（清 heldAt）+ 向上拉回（把链路上已完成祖先翻回活跃；祖先是搁置或删除时不拉回）。
 * 仅 hold 可恢复；active 幂等 noop；completed/deleted 拒绝。
 */
export function restoreTask(
  cmd: RestoreCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const taskId = cmd.taskId
  const task = findLive(rows, 'task', taskId)
  if (!task) {
    throw new Error(`task ${taskId} not found`)
  }
  const status = task.data.status
  if (status === EXPLICIT_STATUS.ACTIVE) {
    return 'noop'
  }
  if (status !== EXPLICIT_STATUS.HOLD) {
    throw new Error(`task ${taskId} not hold (current: ${String(status)})`)
  }
  const tree: TaskTree = buildTaskTree(liveTasksOf(rows))
  applySteps(rows, planRestoreCascade(taskId, tree), cmd.clientTs, nextSyncId)
  return 'applied'
}

/**
 * deleteTask（进回收站）：自身 → DELETED（盖 droppedAt，清原终态戳）。
 * 不改子任务自身状态——父删除时子的有效状态跟随删除（子有效变删除，自身状态保留待 restore_from_trash 恢复）。
 * 仅 deleted 幂等 noop；active/completed/hold 均可进站（SP-STATE-6）。
 * 进站会清掉原终态戳（completedAt/heldAt），只留 droppedAt——回收站语义：原终态失效，统一记为「丢弃时间」。
 * 产品语义：deleted ≡ trashed；永久销毁走在线 purge，不经本 command。
 */
export function deleteTask(
  cmd: DeleteTaskCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const taskId = cmd.taskId
  const task = findLive(rows, 'task', taskId)
  if (!task) {
    throw new Error(`task ${taskId} not found`)
  }
  const status = task.data.status
  if (status === EXPLICIT_STATUS.DELETED) {
    return 'noop'
  }
  const tree: TaskTree = buildTaskTree(liveTasksOf(rows))
  applySteps(rows, planDeleteCascade(taskId, tree), cmd.clientTs, nextSyncId)
  return 'applied'
}

/**
 * restoreFromTrash：删除→活跃（清 droppedAt）+ 向上拉回（把链路上已完成祖先翻回活跃；祖先是搁置或删除时不拉回——救子不连带救父出回收站）。
 * 仅 deleted（回收站）可移出；active 幂等 noop；completed/hold 拒绝。
 */
export function restoreFromTrash(
  cmd: RestoreFromTrashCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const taskId = cmd.taskId
  const task = findLive(rows, 'task', taskId)
  if (!task) {
    throw new Error(`task ${taskId} not found`)
  }
  const status = task.data.status
  if (status === EXPLICIT_STATUS.ACTIVE) {
    return 'noop'
  }
  if (status !== EXPLICIT_STATUS.DELETED) {
    throw new Error(`task ${taskId} not in trash (current: ${String(status)})`)
  }
  const tree: TaskTree = buildTaskTree(liveTasksOf(rows))
  applySteps(rows, planRestoreFromTrashCascade(taskId, tree), cmd.clientTs, nextSyncId)
  return 'applied'
}

/**
 * createTask（新建）：建行（status=ACTIVE + 必需字段 + 默认值）+ 拉回已完成祖先。
 *
 * 必需字段（name/parentId/order/mountDirId）由命令携带；其余无约束字段（note/dates/flagged 等）
 * 默认值填充，后续 upsert patch 补。新 task 物理 ACTIVE → 有效活跃；若挂在物理 COMPLETED 父下，
 * planUpwardActivation 把父拉回活跃（活跃子挂已完成父不遗留违法态）；祖先是搁置或删除时不拉回。
 *
 * taskId（客户端提议新 id）已存在 → 拒绝（purge id 由 applyCommand 的 findPurgedTask 先拦）。
 * parentId（非 null）不存在 → 拒绝（引用校验）。
 */
export function createTask(
  cmd: CreateTaskCommand,
  rows: EntityRow[],
  userId: string,
  nextSyncId: () => number,
): ApplyResult {
  const taskId = cmd.taskId
  const existing = rows.find((r): r is EntityRowOf<'task'> => r.entity === 'task' && r.id === taskId)
  if (existing) {
    throw new Error(`task ${taskId} already exists`)
  }
  if (cmd.parentId != null && !findLive(rows, 'task', cmd.parentId)) {
    throw new Error(`parent task ${cmd.parentId} not found`)
  }
  const data = {
    name: cmd.name,
    note: null,
    mountDirId: cmd.mountDirId,
    parentId: cmd.parentId,
    order: cmd.order,
    status: EXPLICIT_STATUS.ACTIVE,
    groupType: null,
    deferDate: null,
    dueDate: null,
    plannedMode: PLANNED_MODE.NONE,
    plannedDate: null,
    completedAt: null,
    heldAt: null,
    droppedAt: null,
    flagged: false,
    estimateMinutes: null,
    repeatRuleId: null,
    repeatedFromTaskId: null,
    createdAt: cmd.clientTs,
    updatedAt: cmd.clientTs,
  } as EntityRowOf<'task'>['data']
  rows.push({
    entity: 'task',
    id: taskId,
    userId,
    syncId: nextSyncId(),
    deleted: false,
    data,
  })
  // 拉回已完成祖先：新 task 有效活跃；祖先是搁置或删除时 planUpwardActivation 返回空
  const tree: TaskTree = buildTaskTree(liveTasksOf(rows))
  applySteps(rows, planUpwardActivation(taskId, tree), cmd.clientTs, nextSyncId)
  return 'applied'
}

/**
 * moveTask（移动）：改 parentId + order + 拉回已完成祖先（与 createTask 共用 planUpwardActivation）。
 *
 * parentId 变更带动状态联动（活跃子挂已完成父 → 拉回），故走命令而非 LWW patch。
 * 仅当 task **物理活跃**才拉回——completed/hold/deleted task 移动不触发拉回
 * （planUpwardActivation 在 plan 阶段看不到自身将变活跃，故由调用方用物理 status===ACTIVE 守卫；
 * 父完成时子的有效状态跟随完成，effectiveStatus 会被已完成新父变成 completed 而漏拉回，故判物理态；
 * 区别于 reopen/restore 先翻自身 ACTIVE 再 plan）。
 *
 * 防环：新 parentId 不得是 taskId 自身或其后代。parentId（非 null）不存在 → 拒绝。
 */
export function moveTask(
  cmd: MoveTaskCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const taskId = cmd.taskId
  const task = findLive(rows, 'task', taskId)
  if (!task) {
    throw new Error(`task ${taskId} not found`)
  }
  const newParentId = cmd.parentId
  if (newParentId != null && !findLive(rows, 'task', newParentId)) {
    throw new Error(`parent task ${newParentId} not found`)
  }
  // 防环：新 parentId 不得是自身或其后代（移到自己子树下成环）
  if (newParentId != null) {
    if (newParentId === taskId) {
      throw new Error(`cannot move task ${taskId} under itself`)
    }
    const tree = buildTaskTree(liveTasksOf(rows))
    if ([...ancestors(tree, newParentId)].some(a => a.id === taskId)) {
      throw new Error(`cannot move task ${taskId} under its own descendant ${newParentId}`)
    }
  }
  task.data.parentId = newParentId
  task.data.order = cmd.order
  task.syncId = nextSyncId()
  // 拉回：仅当 task 物理活跃——父完成时子的有效状态跟随完成，已完成新父会让物理活跃子的有效变完成，
  // 若用 effectiveStatus 判断会漏拉回（违反"添加活跃子→拉回父让子生效"）；故用物理活跃守卫。
  // planUpwardActivation 内部挡住检查（搁置/删除祖先）仍生效，被压的物理活跃子不拉回。
  const tree = buildTaskTree(liveTasksOf(rows))
  if (task.data.status === EXPLICIT_STATUS.ACTIVE) {
    applySteps(rows, planUpwardActivation(taskId, tree), cmd.clientTs, nextSyncId)
  }
  return 'applied'
}
