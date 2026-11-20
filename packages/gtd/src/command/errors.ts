/**
 * 命令被拒绝时的报错。消息直接展示给用户：用任务名称指代任务，不带 id 与规约编号。
 */
import type { EntityRowOf } from '../data/row-schema'
import type { ExplicitStatusValue } from '../data/types'
import { EXPLICIT_STATUS } from '../data/types'

const STATUS_PHRASE: Record<ExplicitStatusValue, string> = {
  [EXPLICIT_STATUS.ACTIVE]: '尚未完成',
  [EXPLICIT_STATUS.COMPLETED]: '已完成',
  [EXPLICIT_STATUS.HOLD]: '已搁置',
  [EXPLICIT_STATUS.DELETED]: '在回收站中',
}

export function taskLabel(task: EntityRowOf<'task'>): string {
  return `「${task.data.name}」`
}

export function taskNotFound(): Error {
  return new Error('任务不存在或已被永久删除')
}

export function parentNotFound(): Error {
  return new Error('目标父任务不存在或已被永久删除')
}

/** 当前状态不允许执行 action，例如「写周报」已搁置，不能标记完成。 */
export function statusRejected(task: EntityRowOf<'task'>, action: string): Error {
  return new Error(`${taskLabel(task)}${STATUS_PHRASE[task.data.status]}，不能${action}`)
}
