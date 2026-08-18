/**
 * 压制祖先查询（UI 置灰 hover 提示用）。
 *
 * 子的有效状态跟随父时，被祖先连带压制的子（自身仍活跃/完成/搁置，但有效状态被祖先改成
 * 删除/搁置/完成）不应单独操作终态按钮——UI 置灰 + hover「被 {祖先名} 连带 {完成/搁置/删除}，
 * 请从该项操作」。`suppressingAncestor` 返回决定子有效状态的最靠根祖先（最浅那个），供 UI 提示——
 * 逐层继承下有效状态由最靠根的终态决定，指向它让用户一次操作让整棵子树恢复（操作最近祖先后仍可能被更靠根的压制）。
 *
 * 子不能单独恢复（重开/继续/移出回收站）：单 restore 自身无效（挡住在祖先），须从压制祖先操作让子树恢复。
 * 旧版 `trashRestoreTargets`/`holdRestoreTargets`（restore 路由到祖先链）已回退——改置灰替代路由。
 */
import type { EntityRowOf } from '../data/sync-schema'
import type { TaskTree } from '../structure/tree'
import { effectiveStatus } from '../inheritance/effective'
import { ancestors } from '../structure/tree'

/**
 * 返回压制 taskId 的最靠根终态祖先（有效 ≠ 自身状态时）；未被压制则返回 null。
 *
 * - 未被压制（有效 === 自身状态）→ null。
 * - 被压制 → 沿祖先链从根到父（reverse 得最靠根优先）找首个状态 === 有效状态 的祖先（最靠根那个）。
 *   deleted 最优先：有效若为删除，压制源是最靠根的删除祖先；
 *   若为搁置/完成，压制源是最靠根的该态祖先（有效状态由最靠根的终态决定）。
 */
export function suppressingAncestor(task: EntityRowOf<'task'>, tree: TaskTree): EntityRowOf<'task'> | null {
  const eff = effectiveStatus(task, tree)
  if (eff === task.data.status)
    return null // 未被压制（eff==自身物理）
  // 沿祖先链从根到父（reverse 得最靠根优先）找首个状态 === 有效状态 的祖先（最靠根那个）。
  // 逐层下有效状态由最靠根终态决定，指向它让用户一次操作让整棵子树恢复。
  for (const anc of [...ancestors(tree, task.id)].reverse()) {
    if (anc.data.status === eff)
      return anc
  }
  return null
}
