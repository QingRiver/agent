import type { EntityRowOf } from './data/row-schema'
import type { ExplicitStatusValue } from './data/types'
import type { GtdModel, TaskRow } from './state/model'
import { EXPLICIT_STATUS } from './data/types'
import { statusRejected, taskLabel } from './errors'
import { INVARIANT_TEXT } from './invariant'
import { cloneIfRepeating } from './repeat'

export interface UpEffect { kind: 'descendant-activated' }

export interface PropagateTarget {
  ancestors: (taskId: string) => EntityRowOf<'task'>[]
  setStatus: (task: EntityRowOf<'task'>, status: ExplicitStatusValue, ts: string) => void
}

/**
 * 子孙变活跃后沿父链上翻。
 * 搁置或删除的祖先停住（不翻它，也不再往上）；已完成的祖先翻回活跃并继续；活跃的祖先跳过。
 */
export function propagateUp(model: PropagateTarget, taskId: string, effect: UpEffect, ts: string): void {
  if (effect.kind !== 'descendant-activated')
    return
  for (const ancestor of model.ancestors(taskId)) {
    if (ancestor.data.status === EXPLICIT_STATUS.HOLD || ancestor.data.status === EXPLICIT_STATUS.DELETED)
      return
    if (ancestor.data.status === EXPLICIT_STATUS.COMPLETED)
      model.setStatus(ancestor, EXPLICIT_STATUS.ACTIVE, ts)
  }
}

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
      if (task.data.repeatRuleId != null)
        throw new TransitionError('repeat_not_reopenable', `${taskLabel(task)}${INVARIANT_TEXT.repeat_not_reopenable}；下一次已经生成`)
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

export function actionsForStatus(status: ExplicitStatusValue): StatusAction[] {
  return STATUS_ACTIONS.filter((action) => {
    const spec = specOf(action)
    return status !== spec.to && spec.from.includes(status)
  })
}

export function availableActions(model: GtdModel, taskId: string): StatusAction[] {
  const task = model.findTask(taskId)
  if (!task)
    return []
  return availableStatusActions(task)
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
