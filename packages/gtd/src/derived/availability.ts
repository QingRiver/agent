import type { EntityRowOf } from '../data/row-schema'
import type { ComputedStatus } from '../data/schema'
import type { TaskTree } from '../state/tree'
import { COMPUTED_STATUS, EXPLICIT_STATUS, GROUP_TYPE } from '../data/types'
import { effectiveDefer, effectiveDue, effectiveStatus } from '../state/effective'
import { isWallClockUnlocked } from '../time/clock'

/**
 * 可用性：有效状态非活跃则阻塞；否则看 effectiveDefer、串行前序兄弟、截止日。
 * 祖先的终态和推迟日已经折进 effectiveStatus / effectiveDefer，不再递归祖先可用性。
 */
export function computeAvailability(
  task: EntityRowOf<'task'>,
  now: Date,
  tree: TaskTree,
  dueSoonIntervalMs: number,
): ComputedStatus {
  if (effectiveStatus(task, tree) !== EXPLICIT_STATUS.ACTIVE)
    return COMPUTED_STATUS.BLOCKED

  if (!isWallClockUnlocked(effectiveDefer(task, tree), now))
    return COMPUTED_STATUS.BLOCKED

  let node = tree.byId.get(task.id)
  while (node?.parent) {
    const parent = node.parent
    if (parent.task.data.groupType === GROUP_TYPE.SEQUENTIAL) {
      const siblings = parent.children.map(child => child.task)
      const index = siblings.findIndex(sibling => sibling.id === node!.task.id)
      if (index > 0 && siblings.slice(0, index).some(sibling => sibling.data.status === EXPLICIT_STATUS.ACTIVE))
        return COMPUTED_STATUS.BLOCKED
    }
    node = parent
  }

  const due = effectiveDue(task, tree)
  if (due) {
    const dueMs = new Date(due).getTime()
    if (dueMs < now.getTime())
      return COMPUTED_STATUS.OVERDUE
    if (dueMs <= now.getTime() + dueSoonIntervalMs)
      return COMPUTED_STATUS.DUE_SOON
  }
  return COMPUTED_STATUS.AVAILABLE
}

export function computeAll(
  source: { liveTasks: () => EntityRowOf<'task'>[], tree: () => TaskTree },
  now: Date,
  dueSoonIntervalMs: number,
): Record<string, ComputedStatus> {
  const tree = source.tree()
  const result: Record<string, ComputedStatus> = {}
  for (const task of source.liveTasks())
    result[task.id] = computeAvailability(task, now, tree, dueSoonIntervalMs)
  return result
}
