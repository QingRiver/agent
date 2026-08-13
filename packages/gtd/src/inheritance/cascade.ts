/**
 * 状态级联计划（L3 继承层；wiki/draft/gtd-架构分层重设计.md §4.3）。
 *
 * 五个纯函数吃 L1 `TaskTree` + taskId，返回 `CascadeStep[]`（**计划，不执行**）。
 * 只依赖 L1 树结构 + 行 explicit 状态，**不依赖 L5 状态机**——以此破除 L3↔L5 循环。
 *
 * 四句口诀（对齐 wiki/GTD_New.md §状态联动 / OF4）：
 * 完成/搁置父向下、完成/搁置子不上向、重开/恢复上下都不联动。
 * 不采纳 autoCompleteOnLastChild（完成最后子→自动完成父）——违反「完成子不上向」。
 *
 * 执行（盖戳/清戳 + 翻状态 + stamp syncId）由 L5 `applySteps` 负责：见 §`tsField` 约定——
 * `targetStatus === ACTIVE` 则清 `tsField`（置 null），否则盖戳 `tsField` = now。
 *
 * 幂等：只对当前状态匹配的行产 step，遇终态/已达目标态跳过；重放不翻倍。
 */
import type { TaskTree } from '../structure/tree'
import { EXPLICIT_STATUS } from '../data/types'
import { subtree } from '../structure/tree'

/** 一条级联动作：把 taskId 翻到 targetStatus，并按 tsField 盖戳/清戳（由 L5 applySteps 执行）。 */
export interface CascadeStep {
  taskId: string
  targetStatus: typeof EXPLICIT_STATUS[keyof typeof EXPLICIT_STATUS]
  /** 关联时间戳字段；ACTIVE→清空，非 ACTIVE→盖戳 now */
  tsField: 'completedAt' | 'droppedAt'
}

/** 完成父 → 自身 + 所有 ACTIVE 后代 → COMPLETED（向下；跳过非 ACTIVE 终态，幂等）。 */
export function planCompleteCascade(taskId: string, tree: TaskTree): CascadeStep[] {
  const steps: CascadeStep[] = []
  const self = tree.byId.get(taskId)?.task
  if (self?.data.status === EXPLICIT_STATUS.ACTIVE)
    steps.push({ taskId, targetStatus: EXPLICIT_STATUS.COMPLETED, tsField: 'completedAt' })
  for (const desc of subtree(tree, taskId)) {
    if (desc.data.status === EXPLICIT_STATUS.ACTIVE)
      steps.push({ taskId: desc.id, targetStatus: EXPLICIT_STATUS.COMPLETED, tsField: 'completedAt' })
  }
  return steps
}

/** 搁置父 → 自身 + 所有 ACTIVE 后代 → HOLD（向下；跳过非 ACTIVE 终态，幂等）。 */
export function planDropCascade(taskId: string, tree: TaskTree): CascadeStep[] {
  const steps: CascadeStep[] = []
  const self = tree.byId.get(taskId)?.task
  if (self?.data.status === EXPLICIT_STATUS.ACTIVE)
    steps.push({ taskId, targetStatus: EXPLICIT_STATUS.HOLD, tsField: 'droppedAt' })
  for (const desc of subtree(tree, taskId)) {
    if (desc.data.status === EXPLICIT_STATUS.ACTIVE)
      steps.push({ taskId: desc.id, targetStatus: EXPLICIT_STATUS.HOLD, tsField: 'droppedAt' })
  }
  return steps
}

/** 重开 → 仅自身 COMPLETED → ACTIVE / 清 completedAt（不向上、不向下）。 */
export function planReopenCascade(taskId: string, tree: TaskTree): CascadeStep[] {
  const self = tree.byId.get(taskId)?.task
  if (self?.data.status !== EXPLICIT_STATUS.COMPLETED)
    return []
  return [{ taskId, targetStatus: EXPLICIT_STATUS.ACTIVE, tsField: 'completedAt' }]
}

/** 恢复 → 仅自身 HOLD → ACTIVE / 清 droppedAt（不向上、不向下）。 */
export function planRestoreCascade(taskId: string, tree: TaskTree): CascadeStep[] {
  const self = tree.byId.get(taskId)?.task
  if (self?.data.status !== EXPLICIT_STATUS.HOLD)
    return []
  return [{ taskId, targetStatus: EXPLICIT_STATUS.ACTIVE, tsField: 'droppedAt' }]
}

/** 删除父 → 自身 + 所有后代 → DELETED / 盖 droppedAt（向下软删；跳过已 DELETED，幂等）。 */
export function planDeleteCascade(taskId: string, tree: TaskTree): CascadeStep[] {
  const steps: CascadeStep[] = []
  const self = tree.byId.get(taskId)?.task
  if (self && self.data.status !== EXPLICIT_STATUS.DELETED)
    steps.push({ taskId, targetStatus: EXPLICIT_STATUS.DELETED, tsField: 'droppedAt' })
  for (const desc of subtree(tree, taskId)) {
    if (desc.data.status !== EXPLICIT_STATUS.DELETED)
      steps.push({ taskId: desc.id, targetStatus: EXPLICIT_STATUS.DELETED, tsField: 'droppedAt' })
  }
  return steps
}
