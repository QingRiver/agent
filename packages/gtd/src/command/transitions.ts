/**
 * 声明式状态转换表：节点 = ExplicitStatus，边 = StatusAction。
 * runner / canTransition / availableStatusActions 共用同一数据源。
 */
import type { EntityRowOf } from '../data/row-schema'
import type { ExplicitStatusValue } from '../data/types'
import type { CascadeStep } from '../inheritance/cascade'
import type { TaskTree } from '../structure/tree'
import { EXPLICIT_STATUS } from '../data/types'
import { INVARIANT_TEXT } from '../derived/invariant'
import {
  planDeleteCascade,
  planReopenCascade,
  planRestoreCascade,
  planRestoreFromTrashCascade,
} from '../inheritance/cascade'
import { statusRejected, taskLabel } from './errors'

export type StatusAction
  = | 'complete'
    | 'drop'
    | 'reopen'
    | 'restore'
    | 'delete'
    | 'restore_from_trash'

export const STATUS_ACTIONS: readonly StatusAction[] = [
  'complete',
  'drop',
  'reopen',
  'restore',
  'delete',
  'restore_from_trash',
] as const

export interface TransitionSpec {
  label: string
  from: readonly ExplicitStatusValue[]
  to: ExplicitStatusValue
  /** 额外前置条件；返回 false 时 canTransition 为假，runner 抛错 */
  allowed?: (task: EntityRowOf<'task'>) => boolean
  /** 拒绝时的用户文案（allowed 为 false 时） */
  rejectMessage?: (task: EntityRowOf<'task'>) => string
  /** 有则 applySteps(cascade(...))；无则只改自身 */
  cascade?: (taskId: string, tree: TaskTree) => CascadeStep[]
}

export const STATUS_TRANSITIONS: Record<StatusAction, TransitionSpec> = {
  complete: {
    label: '标记完成',
    from: [EXPLICIT_STATUS.ACTIVE],
    to: EXPLICIT_STATUS.COMPLETED,
  },
  drop: {
    label: '搁置',
    from: [EXPLICIT_STATUS.ACTIVE],
    to: EXPLICIT_STATUS.HOLD,
  },
  reopen: {
    label: '重新打开',
    from: [EXPLICIT_STATUS.COMPLETED],
    to: EXPLICIT_STATUS.ACTIVE,
    allowed: task => task.data.repeatRuleId === null,
    rejectMessage: task => `${taskLabel(task)}${INVARIANT_TEXT.repeat_not_reopenable}；下一次已经生成`,
    cascade: planReopenCascade,
  },
  restore: {
    label: '从搁置中恢复',
    from: [EXPLICIT_STATUS.HOLD],
    to: EXPLICIT_STATUS.ACTIVE,
    cascade: planRestoreCascade,
  },
  delete: {
    label: '删除',
    from: [EXPLICIT_STATUS.ACTIVE, EXPLICIT_STATUS.COMPLETED, EXPLICIT_STATUS.HOLD],
    to: EXPLICIT_STATUS.DELETED,
    cascade: planDeleteCascade,
  },
  restore_from_trash: {
    label: '移出回收站',
    from: [EXPLICIT_STATUS.DELETED],
    to: EXPLICIT_STATUS.ACTIVE,
    cascade: planRestoreFromTrashCascade,
  },
}

/**
 * 某任务当前能否执行该动作。
 * - 已在目标态 → false（UI 不展示「再完成一次」；runner 侧走 noop）
 * - 不在 from → false
 * - allowed 失败 → false
 */
export function canTransition(task: EntityRowOf<'task'>, action: StatusAction): boolean {
  const spec = STATUS_TRANSITIONS[action]
  const status = task.data.status
  if (status === spec.to)
    return false
  if (!spec.from.includes(status))
    return false
  if (spec.allowed && !spec.allowed(task))
    return false
  return true
}

/** 某任务当前可执行的全部 StatusAction（菜单/工具栏） */
export function availableStatusActions(task: EntityRowOf<'task'>): StatusAction[] {
  return STATUS_ACTIONS.filter(action => canTransition(task, action))
}

/** 仅按显式状态（忽略 task 级 guard）列出可能边——表驱动单测用 */
export function actionsForStatus(status: ExplicitStatusValue): StatusAction[] {
  return STATUS_ACTIONS.filter((action) => {
    const spec = STATUS_TRANSITIONS[action]
    return status !== spec.to && spec.from.includes(status)
  })
}

/** runner 前置：已在 to → 'noop'；否则校验 from + allowed，通过返回 'ready' */
export function ensureTransition(
  task: EntityRowOf<'task'>,
  action: StatusAction,
): 'noop' | 'ready' {
  const spec = STATUS_TRANSITIONS[action]
  if (task.data.status === spec.to)
    return 'noop'
  if (!spec.from.includes(task.data.status))
    throw statusRejected(task, spec.label)
  if (spec.allowed && !spec.allowed(task))
    throw new Error(spec.rejectMessage?.(task) ?? `${taskLabel(task)}不能${spec.label}`)
  return 'ready'
}
