import type { TaskRow } from '../data/rows'
import type { ExplicitStatusValue } from '../data/types'
import type { GtdModel } from '../state/model'
import type { UpEffect } from '../state/propagate'
import { EXPLICIT_STATUS } from '../data/types'
import { propagateUp } from '../state/propagate'
import { statusRejected, taskLabel } from './errors'
import { cloneIfRepeating } from './repeat'

export class TransitionError extends Error {
  readonly code: string

  constructor(code: string, message?: string) {
    super(message ?? code)
    this.name = 'TransitionError'
    this.code = code
  }
}

export type StatusAction
  = | 'complete'
    | 'drop'
    | 'reopen'
    | 'restore'
    | 'delete'
    | 'restore_from_trash'

/**
 * 全部状态动作（`as const` 元组，供 `z.enum` 与 `StatusAction` 类型派生）。
 * 须与 {@link TRANSITIONS} 的 spec 列表保持同步——新增动作时两处都要加。
 */
export const STATUS_ACTIONS: readonly StatusAction[] = [
  'complete',
  'drop',
  'reopen',
  'restore',
  'delete',
  'restore_from_trash',
] as const

export interface TransitionSpec {
  action: StatusAction
  label: string
  from: readonly ExplicitStatusValue[]
  to: ExplicitStatusValue
  guard?: (task: TaskRow) => void
  local?: (model: GtdModel, task: TaskRow, ts: string) => void
  propagate?: UpEffect
}

export const TRANSITIONS: readonly TransitionSpec[] = [
  {
    action: 'complete',
    label: '标记完成',
    from: [EXPLICIT_STATUS.ACTIVE],
    to: EXPLICIT_STATUS.COMPLETED,
    local: (model, task, ts) => cloneIfRepeating(model, task, ts),
  },
  {
    action: 'drop',
    label: '搁置',
    from: [EXPLICIT_STATUS.ACTIVE],
    to: EXPLICIT_STATUS.HOLD,
  },
  {
    action: 'reopen',
    label: '重新打开',
    from: [EXPLICIT_STATUS.COMPLETED],
    to: EXPLICIT_STATUS.ACTIVE,
    guard: (task) => {
      if (task.data.repeatRule != null)
        throw new TransitionError('repeat_not_reopenable', `${taskLabel(task)}是重复任务的已完成实例，不能重新打开；下一次已经生成`)
    },
    propagate: { kind: 'descendant-activated' },
  },
  {
    action: 'restore',
    label: '从搁置中恢复',
    from: [EXPLICIT_STATUS.HOLD],
    to: EXPLICIT_STATUS.ACTIVE,
    propagate: { kind: 'descendant-activated' },
  },
  {
    action: 'delete',
    label: '删除',
    from: [EXPLICIT_STATUS.ACTIVE, EXPLICIT_STATUS.COMPLETED, EXPLICIT_STATUS.HOLD],
    to: EXPLICIT_STATUS.DELETED,
  },
  {
    action: 'restore_from_trash',
    label: '移出回收站',
    from: [EXPLICIT_STATUS.DELETED],
    to: EXPLICIT_STATUS.ACTIVE,
    propagate: { kind: 'descendant-activated' },
  },
]

export const STATUS_TRANSITIONS: Record<StatusAction, TransitionSpec> = Object.fromEntries(
  TRANSITIONS.map(spec => [spec.action, spec]),
) as Record<StatusAction, TransitionSpec>

function specOf(action: StatusAction): TransitionSpec {
  return STATUS_TRANSITIONS[action]
}

function fromMatches(spec: TransitionSpec, status: ExplicitStatusValue): boolean {
  return spec.from.includes(status)
}

/** 当前显式状态能否走这条边。已在目标态、from 不符或 guard 失败都为 false。 */
export function canTransition(task: TaskRow, action: StatusAction): boolean {
  const spec = specOf(action)
  if (task.data.status === spec.to || !fromMatches(spec, task.data.status))
    return false
  if (!spec.guard)
    return true
  try {
    spec.guard(task)
    return true
  }
  catch {
    return false
  }
}

export function availableStatusActions(task: TaskRow): StatusAction[] {
  return STATUS_ACTIONS.filter(action => canTransition(task, action))
}

/**
 * 执行一次状态转移。from 不匹配时抛 TransitionError，不静默跳过。
 */
export function transition(model: GtdModel, taskId: string, action: StatusAction, ts: string): void {
  const task = model.findTask(taskId)
  if (!task)
    throw new TransitionError('not_found', '任务不存在或已被永久删除')
  const spec = specOf(action)
  if (task.data.status === spec.to || !fromMatches(spec, task.data.status))
    throw new TransitionError('invalid_from', statusRejected(task, spec.label).message)
  spec.guard?.(task)
  model.setStatus(task, spec.to, ts)
  spec.local?.(model, task, ts)
  if (spec.propagate)
    propagateUp(model, taskId, spec.propagate, ts)
}
