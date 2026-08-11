/**
 * 任务状态机（L5 command）：complete / drop / reopen / restore / deleteTask 的纯函数实现。
 *
 * 各函数接收 cmd + rows + nextSyncId，按状态机规则推进任务状态
 * （仅可推进态可推进；同态幂等 noop；异态拒绝 throw），并经 L3 `cascade.ts` 级联
 * （complete/drop/delete 向下、reopen/restore 向上）。complete 重复任务时克隆下一实例。
 * 纯 rows→rows，不持有状态、不落库；由 `sync/apply.ts` 的 `applyCommand` dispatch 调用。
 *
 * 状态机语义见 `wiki/draft/gtd行为规约.md` SP-STATE-2/3/4/5/6/8。
 */
import type {
  CompleteCommand,
  DeleteTaskCommand,
  DropCommand,
  EntityRow,
  EntityRowOf,
  ReopenCommand,
  RestoreCommand,
  SyncEntity,
} from '../data/sync-schema'
import type { CascadeStep } from '../inheritance/cascade'
import type { TaskTree } from '../structure/tree'
import { EXPLICIT_STATUS } from '../data/types'
import { planCompleteCascade, planDeleteCascade, planDropCascade, planReopenCascade, planRestoreCascade } from '../inheritance/cascade'
import { buildTaskTree } from '../structure/tree'
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
function liveTasksOf(rows: EntityRow[]): EntityRowOf<'task'>[] {
  return rows.filter((r): r is EntityRowOf<'task'> => r.entity === 'task' && !r.deleted)
}

/**
 * 执行级联计划：逐条 findLive → 翻 status + 按 tsField 盖戳(非 ACTIVE)/清戳(ACTIVE) + stamp syncId。
 * `ts` 为盖戳 ISO 串（通常 cmd.clientTs）。空 steps 为 noop。跳过找不到的行。
 */
function applySteps(
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
    task.data[step.tsField] = step.targetStatus === EXPLICIT_STATUS.ACTIVE ? null : ts
    task.syncId = nextSyncId()
  }
}

/** complete + repeat + 向下级联：旧任务终态 + （若重复）克隆下一实例 + ACTIVE 后代级联完成。 */
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
  }

  // 向下级联：ACTIVE 后代 → COMPLETED（self 已 COMPLETED，计划自动跳过；幂等）
  const tree: TaskTree = buildTaskTree(liveTasksOf(rows))
  applySteps(rows, planCompleteCascade(taskId, tree), cmd.clientTs, nextSyncId)

  return 'applied'
}

/** drop + 向下级联：旧任务置 hold 终态 + ACTIVE 后代级联搁置。 */
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
  task.data.droppedAt = cmd.clientTs
  task.syncId = nextSyncId()

  // 向下级联：ACTIVE 后代 → HOLD（self 已 HOLD，计划自动跳过；幂等）
  const tree: TaskTree = buildTaskTree(liveTasksOf(rows))
  applySteps(rows, planDropCascade(taskId, tree), cmd.clientTs, nextSyncId)

  return 'applied'
}

/**
 * reopen + 向上级联：COMPLETED → ACTIVE（清 completedAt）+ 链路 COMPLETED 祖先转 ACTIVE。
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
 * restore + 向上级联：HOLD → ACTIVE（清 droppedAt）+ 链路 HOLD 祖先转 ACTIVE。
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
 * deleteTask + 向下级联：自身 + 所有后代 → DELETED（盖 droppedAt），向下软删。
 * 仅 active 可 delete；deleted 幂等 noop；completed/hold 拒绝（SP-STATE-6）。
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
  if (status !== EXPLICIT_STATUS.ACTIVE) {
    throw new Error(`task ${taskId} not active (current: ${String(status)})`)
  }
  const tree: TaskTree = buildTaskTree(liveTasksOf(rows))
  applySteps(rows, planDeleteCascade(taskId, tree), cmd.clientTs, nextSyncId)
  return 'applied'
}
