/**
 * 防御性兜底协调器（reconcile）：扫并修复「物理 completed ∧ 有效活跃直接子」违法态。
 *
 * 父完成时子有效状态跟随完成——complete(P) 后子有效变完成（非活跃），此态由 effectiveStatus
 * 派生层自动保证合法，正常路径下 reconcile 恒不触发。仅兜 effectiveStatus 演化/缓存失效/并发边缘的
 * 假设性违法态，与命令通道**同构**：对有效活跃直接子跑 planUpwardActivation（把已完成祖先翻回活跃，
 * 祖先是搁置或删除时停止），复用 applySteps 盖戳/清戳/stamp syncId，保证字节同构、多端确定性一致。
 *
 * 纯函数：原地 mutate rows（与 applyPush 一致），返回被翻回 ACTIVE 的 task id 列表。
 * 幂等：无违法态时返回空、不改行。迭代至 fixpoint（planUpwardActivation 翻整链，通常一轮收敛）。
 */
import type { EntityRow } from '../data/sync-schema'
import type { TaskTree } from '../structure/tree'
import { applySteps, liveTasksOf } from '../command/state-machine'
import { EXPLICIT_STATUS } from '../data/types'
import { planUpwardActivation } from '../inheritance/cascade'
import { effectiveStatus } from '../inheritance/effective'
import { buildTaskTree, children } from '../structure/tree'

export interface ReconcileResult {
  /** 被翻回 ACTIVE 的 task id（去重）。空数组表示无违法态、未改行。 */
  reactivated: string[]
}

/**
 * 修复「物理 completed ∧ 有效活跃直接子」违法态。
 *
 * 每轮在最新行集上建树，找首个违法父子对，对该有效活跃子跑 planUpwardActivation
 * （翻其链上全部 COMPLETED 祖先→ACTIVE；直接父必在其中，故违法态消除），
 * 重建树进入下一轮，直至无违法态。上限 = 活跃 task 数，防病态循环。
 */
export function reconcile(rows: EntityRow[], ts: string, nextSyncId: () => number): ReconcileResult {
  const reactivated = new Set<string>()
  const maxPasses = Math.max(1, liveTasksOf(rows).length)
  for (let pass = 0; pass < maxPasses; pass++) {
    const tasks = liveTasksOf(rows)
    const tree: TaskTree = buildTaskTree(tasks)
    let steps = null as ReturnType<typeof planUpwardActivation> | null
    for (const t of tasks) {
      if (steps)
        break
      if (t.data.status !== EXPLICIT_STATUS.COMPLETED)
        continue
      for (const c of children(tree, t.id)) {
        if (effectiveStatus(c, tree) === EXPLICIT_STATUS.ACTIVE) {
          // 有效活跃子挂物理 completed 父→违法；planUpwardActivation 翻该子链上 COMPLETED 祖先→ACTIVE
          steps = planUpwardActivation(c.id, tree)
          break
        }
      }
    }
    if (!steps || steps.length === 0)
      break
    applySteps(rows, steps, ts, nextSyncId)
    for (const s of steps)
      reactivated.add(s.taskId)
  }
  return { reactivated: [...reactivated] }
}
