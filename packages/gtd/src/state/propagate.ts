/**
 * 写侧级联：子孙变活跃后沿父链上翻，把被连带置成终态的祖先拉回活跃。
 *
 * 与 `./effective`（读侧继承）对称：effective 沿链向下投影状态，propagate 沿链向上恢复状态。
 * 被 create / move / transition / repeat 共用，故独立于 transition。
 */
import type { EntityRowOf } from '../data/row-schema'
import type { ExplicitStatusValue } from '../data/types'
import { EXPLICIT_STATUS } from '../data/types'

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
