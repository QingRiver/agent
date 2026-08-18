/**
 * 状态级联计划（L3 继承层；wiki/draft/gtd-架构分层重设计.md §4.3）。
 *
 * 五个纯函数吃 L1 `TaskTree` + taskId，返回 `CascadeStep[]`（**计划，不执行**）。
 * 只依赖 L1 树结构 + 行 explicit 状态，**不依赖 L5 状态机**——以此破除 L3↔L5 循环。
 *
 * 四句口诀（对齐 wiki/GTD.md §状态联动；子的有效状态跟随父，不改子任务自身状态）：
 * 完成/搁置/删除父**不改子任务自身状态**（子的有效状态跟随父，自身状态保留待父恢复后生效）；
 * 完成子不上向（子完成不自动完成父）；重开/恢复/移出回收站子向上翻——把链路上**已完成** 祖先翻回活跃
 * （祖先是搁置或删除时不向上翻；不翻搁置/删除的祖先——搁置/删除最优先）。
 * 不采纳 autoCompleteOnLastChild（完成最后子→自动完成父）——违反「完成子不上向」。
 *
 * 物理不变量 INV：禁止「物理完成 ∧ 有效活跃直接子」（有效维度）。
 * 父完成时子有效状态跟随完成：complete(P) 后子有效变完成（无有效活跃直接子），INV 自动满足；
 * reconcile 作脏数据/并发遗留兜底。createTask/moveTask/克隆 planUpwardActivation 向上翻补齐重开路径。
 *
 * 执行（盖戳/清戳 + 翻状态 + stamp syncId）由 L5 `applySteps` 负责：`targetStatus` 决定戳一致性——
 * ACTIVE 则三个终态戳全清；任一终态则盖该终态戳、清另两个（单一终态时间戳不变量，见 derived/invariant.ts）。
 * `CascadeStep` 因此只携带 `targetStatus`，时间戳字段可由 `targetStatus` 推导，无需冗余 `tsField`。
 *
 * 幂等：只对当前状态匹配的行产 step，遇终态/已达目标态跳过；重放不翻倍。
 */
import type { TaskTree } from '../structure/tree'
import { EXPLICIT_STATUS } from '../data/types'
import { ancestors, subtree } from '../structure/tree'
import { effectiveStatus } from './effective'

/** 一条级联动作：把 taskId 翻到 targetStatus（盖戳/清戳由 L5 applySteps 按 targetStatus 推导）。 */
export interface CascadeStep {
  taskId: string
  targetStatus: typeof EXPLICIT_STATUS[keyof typeof EXPLICIT_STATUS]
}

/**
 * 完成计划：父完成时子的有效状态跟随完成——只改自身状态为完成（子的有效状态由 effectiveStatus
 * 派生为完成，不改子任务自身状态）。故 plan 恒返回空（自身由 completeTask 命令直接写）。
 * 物理不变量 INV「物理完成 ∧ 有效活跃直接子」自动维护：complete(P) 后子有效变完成，无有效活跃直接子；reconcile 作脏数据兜底。
 */
export function planCompleteCascade(_taskId: string, _tree: TaskTree): CascadeStep[] {
  return []
}

/**
 * 搁置计划：父搁置时子的有效状态跟随搁置（不改子任务自身状态；子有效变搁置，自身状态保留待恢复）。
 * 搁置只改自身状态为搁置。恒返回空（自身由命令直接写）。
 */
export function planDropCascade(_taskId: string, _tree: TaskTree): CascadeStep[] {
  return []
}

/**
 * 重开 → 自身从完成翻回活跃 + 向上翻：把路径上已完成祖先翻回活跃（祖先是搁置或删除时不向上翻）。
 * 向下不级联（重开父不联动后代）。幂等。
 */
export function planReopenCascade(taskId: string, tree: TaskTree): CascadeStep[] {
  const self = tree.byId.get(taskId)?.task
  if (self?.data.status !== EXPLICIT_STATUS.COMPLETED)
    return []
  return [{ taskId, targetStatus: EXPLICIT_STATUS.ACTIVE }, ...planUpwardActivation(taskId, tree)]
}

/**
 * 恢复搁置 → 自身从搁置翻回活跃 + 向上翻：把路径上已完成祖先翻回活跃（祖先是搁置或删除时不向上翻）。
 * 向下不级联（恢复父不联动后代）。幂等。
 */
export function planRestoreCascade(taskId: string, tree: TaskTree): CascadeStep[] {
  const self = tree.byId.get(taskId)?.task
  if (self?.data.status !== EXPLICIT_STATUS.HOLD)
    return []
  return [{ taskId, targetStatus: EXPLICIT_STATUS.ACTIVE }, ...planUpwardActivation(taskId, tree)]
}

/**
 * 向上翻计划（wiki/GTD.md「统一拉回函数 planUpwardActivation」）：
 * 子孙有效变活跃 → 把路径上**已完成** 祖先翻回活跃。
 *
 * - **挡住检查**：若 taskId 任一祖先是搁置或删除（有效非活跃），返回 `[]`——被搁置/删除的祖先挡住的
 *   物理活跃子不向上翻（搁置/删除最优先，不被子重开推翻）。
 * - **只翻已完成祖先**，不翻搁置/删除的祖先（不解除祖先的搁置/删除）。
 * - **不含 taskId 自身 step**（调用方 reopen/restore/restore_from_trash/createTask/moveTask/克隆负责自身翻回活跃）。
 *
 * 幂等：无已完成祖先 → `[]`；被挡住 → `[]`。
 * 终态戳清理由 L5 applySteps 按 targetStatus=ACTIVE 统一执行（三戳全清）。
 */
export function planUpwardActivation(taskId: string, tree: TaskTree): CascadeStep[] {
  const ancList = [...ancestors(tree, taskId)]
  // 挡住：任一祖先是搁置或删除 → taskId 有效被压，不向上翻
  if (ancList.some(a => a.data.status === EXPLICIT_STATUS.HOLD || a.data.status === EXPLICIT_STATUS.DELETED))
    return []
  // 未被挡住 → 翻已完成祖先（活跃祖先跳过）
  return ancList
    .filter(a => a.data.status === EXPLICIT_STATUS.COMPLETED)
    .map(a => ({ taskId: a.id, targetStatus: EXPLICIT_STATUS.ACTIVE }))
}

/**
 * 移出回收站 → 自身从删除翻回活跃 + 向上翻：把路径上已完成祖先翻回活跃。
 * 祖先是搁置或删除时不向上翻（救子不连带救父出回收站——删除最优先，需单独 restore_from_trash 父）。
 * 向下不级联。幂等。
 */
export function planRestoreFromTrashCascade(taskId: string, tree: TaskTree): CascadeStep[] {
  const self = tree.byId.get(taskId)?.task
  if (self?.data.status !== EXPLICIT_STATUS.DELETED)
    return []
  return [{ taskId, targetStatus: EXPLICIT_STATUS.ACTIVE }, ...planUpwardActivation(taskId, tree)]
}

/**
 * 进回收站计划：父删除时子的有效状态跟随删除（不改子任务自身状态；子有效变删除，自身状态保留待恢复）。
 * 只改自身状态为删除（跳过已删除，幂等）。向下不级联——救子不连带，删父不连带删子任务状态。
 */
export function planDeleteCascade(taskId: string, tree: TaskTree): CascadeStep[] {
  const self = tree.byId.get(taskId)?.task
  if (self && self.data.status !== EXPLICIT_STATUS.DELETED)
    return [{ taskId, targetStatus: EXPLICIT_STATUS.DELETED }]
  return []
}

/**
 * purge（清空回收站 / 永久销毁）计划：返回要物理删除（tombstone）的 task ids。
 *
 * delete(T) 不改子任务自身状态——子的有效状态跟随删除进回收站视图（自身状态保留）。
 * 若 purge(T) 只删 T，子失去删除祖先的覆盖会「复活」回正常视图——故 purge 必须连带物理删除
 * 所有有效状态为删除的后代（= T 的整个子树：T 删除覆盖全部后代的有效状态）。
 *
 * - 仅对回收站项（T 物理 DELETED）有意义；非 DELETED 返回 `[]`。
 * - 基于 effectiveStatus 判定（鲁棒）：只删 effective deleted 的后代，非 deleted 子树不波及。
 * - 返回 ids 列表（含 T 自身）；执行（envelope.deleted + status=DELETED tombstone）由服务端/apply 层负责。
 *
 * 幂等：T 非 DELETED → `[]`。
 */
export function planPurgeCascade(taskId: string, tree: TaskTree): string[] {
  const self = tree.byId.get(taskId)?.task
  if (!self || self.data.status !== EXPLICIT_STATUS.DELETED)
    return []
  const result = [taskId]
  for (const desc of subtree(tree, taskId)) {
    if (effectiveStatus(desc, tree) === EXPLICIT_STATUS.DELETED)
      result.push(desc.id)
  }
  return result
}
