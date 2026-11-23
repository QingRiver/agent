/**
 * 任务状态机（L5 command）：执行层。
 *
 * **状态图配置**在 {@link ./transitions.ts} 的 `STATUS_TRANSITIONS`（from/to/cascade/guard）；
 * 本文件只提供 `runStatusTransition` runner，以及 complete 克隆 / createTask / moveTask。
 *
 * 语义见 wiki/draft/gtd行为规约.md SP-STATE-2/3/4/5/6/8。
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
} from '../data/row-schema'
import type { CascadeStep } from '../inheritance/cascade'
import type { StatusAction } from './transitions'
import { match } from 'ts-pattern'
import { findLive, taskTree } from '../data/rows'
import { EXPLICIT_STATUS, PLANNED_MODE } from '../data/types'
import { planUpwardActivation } from '../inheritance/cascade'
import { ancestors } from '../structure/tree'
import { shouldStop } from '../time/date-math'
import { parentNotFound, taskLabel, taskNotFound } from './errors'
import { cloneNextInstance } from './repeat'
import { ensureTransition, STATUS_TRANSITIONS } from './transitions'

export type ApplyResult = 'applied' | 'noop'

export {
  actionsForStatus,
  availableStatusActions,
  canTransition,
  STATUS_ACTIONS,
  STATUS_TRANSITIONS,
  type StatusAction,
  type TransitionSpec,
} from './transitions'

/**
 * 执行级联计划：翻 status + 按 targetStatus 维护单一终态时间戳 + stamp syncId。
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
    setTaskStatus(task, step.targetStatus, ts, nextSyncId)
  }
}

/** 单节点状态跃迁（含终态戳一致性）。 */
export function setTaskStatus(
  task: EntityRowOf<'task'>,
  targetStatus: typeof EXPLICIT_STATUS[keyof typeof EXPLICIT_STATUS],
  ts: string,
  nextSyncId: () => number,
): void {
  task.data.status = targetStatus
  match(targetStatus)
    .with(EXPLICIT_STATUS.ACTIVE, () => {
      task.data.completedAt = null
      task.data.heldAt = null
      task.data.droppedAt = null
    })
    .with(EXPLICIT_STATUS.COMPLETED, () => {
      task.data.completedAt = ts
      task.data.heldAt = null
      task.data.droppedAt = null
    })
    .with(EXPLICIT_STATUS.HOLD, () => {
      task.data.heldAt = ts
      task.data.completedAt = null
      task.data.droppedAt = null
    })
    .with(EXPLICIT_STATUS.DELETED, () => {
      task.data.droppedAt = ts
      task.data.completedAt = null
      task.data.heldAt = null
    })
    .exhaustive()
  task.syncId = nextSyncId()
}

function runStatusTransition(
  action: StatusAction,
  cmd: { taskId: string, clientTs: string },
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const task = findLive(rows, 'task', cmd.taskId)
  if (!task)
    throw taskNotFound()

  const gate = ensureTransition(task, action)
  if (gate === 'noop')
    return 'noop'

  const spec = STATUS_TRANSITIONS[action]
  if (spec.cascade) {
    applySteps(rows, spec.cascade(cmd.taskId, taskTree(rows)), cmd.clientTs, nextSyncId)
  }
  else {
    setTaskStatus(task, spec.to, cmd.clientTs, nextSyncId)
  }
  return 'applied'
}

/**
 * complete + repeat：先走转换表前置校验，再克隆下一实例（不硬塞进通用 runner）。
 */
export function completeTask(
  cmd: CompleteCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const task = findLive(rows, 'task', cmd.taskId)
  if (!task)
    throw taskNotFound()

  const gate = ensureTransition(task, 'complete')
  if (gate === 'noop')
    return 'noop'

  const taskId = cmd.taskId
  const repeatRuleId = task.data.repeatRuleId
  const rule = repeatRuleId != null ? task.data.repeatRule : undefined
  const now = new Date(cmd.clientTs)
  const willClone = repeatRuleId != null && rule != null && !shouldStop(rule, now)

  let nextTaskId: string | null = null
  let reviveExisting: EntityRow | null = null
  if (willClone) {
    const proposedNextId = cmd.clientGenerated?.nextTaskId
    if (!proposedNextId)
      throw new Error(`repeat task ${taskId} missing clientGenerated.nextTaskId`)
    nextTaskId = proposedNextId
    const existingNextTask = rows.find((r): r is EntityRowOf<'task'> =>
      r.entity === 'task' && r.id === nextTaskId)
    if (existingNextTask) {
      if (existingNextTask.data.repeatedFromTaskId !== taskId)
        throw new Error(`nextTaskId ${nextTaskId} occupied by different source`)
      if (existingNextTask.deleted)
        reviveExisting = existingNextTask
      else
        nextTaskId = null
    }
  }

  setTaskStatus(task, EXPLICIT_STATUS.COMPLETED, cmd.clientTs, nextSyncId)
  if (nextTaskId && rule)
    task.data.repeatRule = { ...rule, completedOccurrences: rule.completedOccurrences + 1 }

  if (nextTaskId && rule) {
    cloneNextInstance(task, rule, nextTaskId, reviveExisting, cmd.clientTs, rows, nextSyncId)
    applySteps(rows, planUpwardActivation(nextTaskId, taskTree(rows)), cmd.clientTs, nextSyncId)
  }

  return 'applied'
}

export function dropTask(
  cmd: DropCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  return runStatusTransition('drop', cmd, rows, nextSyncId)
}

export function reopenTask(
  cmd: ReopenCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  return runStatusTransition('reopen', cmd, rows, nextSyncId)
}

export function restoreTask(
  cmd: RestoreCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  return runStatusTransition('restore', cmd, rows, nextSyncId)
}

export function deleteTask(
  cmd: DeleteTaskCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  return runStatusTransition('delete', cmd, rows, nextSyncId)
}

export function restoreFromTrash(
  cmd: RestoreFromTrashCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  return runStatusTransition('restore_from_trash', cmd, rows, nextSyncId)
}

export function createTask(
  cmd: CreateTaskCommand,
  rows: EntityRow[],
  userId: string,
  nextSyncId: () => number,
): ApplyResult {
  const taskId = cmd.taskId
  const existing = rows.find((r): r is EntityRowOf<'task'> => r.entity === 'task' && r.id === taskId)
  if (existing)
    throw new Error(`task ${taskId} already exists`)
  if (cmd.parentId != null && !findLive(rows, 'task', cmd.parentId))
    throw parentNotFound()
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
  applySteps(rows, planUpwardActivation(taskId, taskTree(rows)), cmd.clientTs, nextSyncId)
  return 'applied'
}

export function moveTask(
  cmd: MoveTaskCommand,
  rows: EntityRow[],
  nextSyncId: () => number,
): ApplyResult {
  const taskId = cmd.taskId
  const task = findLive(rows, 'task', taskId)
  if (!task)
    throw taskNotFound()
  const newParentId = cmd.parentId
  if (newParentId != null && !findLive(rows, 'task', newParentId))
    throw parentNotFound()
  if (newParentId != null) {
    const tree = taskTree(rows)
    if (newParentId === taskId || [...ancestors(tree, newParentId)].some(a => a.id === taskId))
      throw new Error(`${taskLabel(task)}不能移到自己或自己的子任务下面`)
  }
  task.data.parentId = newParentId
  task.data.order = cmd.order
  task.syncId = nextSyncId()
  if (task.data.status === EXPLICIT_STATUS.ACTIVE)
    applySteps(rows, planUpwardActivation(taskId, taskTree(rows)), cmd.clientTs, nextSyncId)
  return 'applied'
}
