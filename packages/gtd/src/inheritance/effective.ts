/**
 * 继承派生（L3 继承层；wiki/draft/gtd-架构分层重设计.md §4.1 / §5）。
 *
 * 纯函数吃 L1 `TaskTree`（+ 标签时的 RowStore），派生 effective 值，**不落库、不发 mutation**：
 * - `effectiveDue` = 天花板：`min(自身 dueDate, 父 effectiveDue)`，null 视为 +∞（无约束）。
 * - `effectiveDefer` = 地板：`max(自身 deferDate, 父 effectiveDefer)`，再钳 `min(它, effectiveDue)`；null 视为 −∞（无下界）。
 * - `effectivePlannedDate` / `effectivePlannedMode` = OF4 coalesce：自身有直接赋值则用自身，否则取最近祖先；
 *   **无** min/max 约束（计划日不制造可用性限制）。
 * 标签不走读时继承：OF4 Inherited Tags Assignment 为入组时写复制（client `copyTagMutsFromParent`）。
 *
 * 实现等价说明：因 `effectiveDue` 沿父子链单调不增（子 = min(自身, 父) ≤ 父），各祖先层的 defer 钳制
 * 被最末（当前任务）的钳制 ceiling 收紧——故 `max` 沿链取原始 deferDate 后只钳一次 `effectiveDue` 与
 * 递归「每层 max 后钳本层 effectiveDue」等价。这里取折叠法，O(depth) 无递归、无防环开销。
 * 树无环由 SP-INV-CYCLE 在不变量层保证；`ancestors` 顺 `node.parent` 链自然终止。
 *
 * SoT：wiki/GTD_New.md §时间联动。
 */
import type { EntityRowOf } from '../data/sync-schema'
import type { TaskTree } from '../structure/tree'
import { PLANNED_MODE } from '../data/types'
import { ancestors } from '../structure/tree'

/** ISO 时间戳或 null（null 语义随调用方而定：+∞ 或 −∞）。 */
type Iso = string | null

type PlannedMode = (typeof PLANNED_MODE)[keyof typeof PLANNED_MODE]

/** min：null 视为 +∞（无约束）。两 null → null；单 null → 另一值；双值 → 较早者（保留原串不重格式化）。 */
function minIso(a: Iso, b: Iso): Iso {
  if (a == null)
    return b
  if (b == null)
    return a
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b
}

/** max：null 视为 −∞（无下界）。两 null → null；单 null → 另一值；双值 → 较晚者。 */
function maxIso(a: Iso, b: Iso): Iso {
  if (a == null)
    return b
  if (b == null)
    return a
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b
}

/**
 * effective 截止日（天花板）：`min(自身 dueDate, 祖先 effectiveDue)`。
 * 全链无 dueDate → null（无约束 = +∞）。纯只读，不改写物理 `dueDate`（SP-INH-DUE-IMMUT）。
 */
export function effectiveDue(task: EntityRowOf<'task'>, tree: TaskTree): Iso {
  let acc: Iso = task.data.dueDate
  for (const anc of ancestors(tree, task.id))
    acc = minIso(acc, anc.data.dueDate)
  return acc
}

/**
 * effective 推迟日（地板）：`max(自身 deferDate, 祖先 effectiveDefer)`，再钳 `min(它, effectiveDue)`。
 * 全链无 deferDate → null（无下界 = −∞，立即可用，**不**坍缩到 due）。
 * 钳制保证 effectiveDefer ≤ effectiveDue（defer 不得晚于 due）。纯只读（SP-INH-DEFER-IMMUT）。
 */
export function effectiveDefer(task: EntityRowOf<'task'>, tree: TaskTree): Iso {
  let acc: Iso = task.data.deferDate
  for (const anc of ancestors(tree, task.id))
    acc = maxIso(acc, anc.data.deferDate)
  // acc 为全链原始 max；null = −∞（无 defer 约束）→ 直接返回 null，钳制不把它抬到 due
  if (acc == null)
    return null
  // 钳到 effectiveDue（null = +∞ 时不钳）
  return minIso(acc, effectiveDue(task, tree))
}

/** 本节点是否对计划有直接赋值（OF：directly assigned）。 */
function hasOwnPlanned(task: EntityRowOf<'task'>): boolean {
  const mode = task.data.plannedMode ?? PLANNED_MODE.NONE
  return mode !== PLANNED_MODE.NONE
}

/**
 * effective 计划模式（OF4 coalesce）：自身 ≠ none 则用自身，否则取最近祖先的非 none。
 * rolling 为本仓库扩展；继承时与 on 同等视为「已直接赋值」。
 */
export function effectivePlannedMode(task: EntityRowOf<'task'>, tree: TaskTree): PlannedMode {
  if (hasOwnPlanned(task))
    return task.data.plannedMode ?? PLANNED_MODE.NONE
  for (const anc of ancestors(tree, task.id)) {
    if (hasOwnPlanned(anc))
      return anc.data.plannedMode ?? PLANNED_MODE.NONE
  }
  return PLANNED_MODE.NONE
}

/**
 * effective 计划日（OF4 coalesce / *Planned with container*）：
 * - 自身 `plannedMode=on` 且有 `plannedDate` → 用自身（可早于/晚于 defer·due，无约束）
 * - 自身 `rolling` → null（滚动无固定物理日；模式见 `effectivePlannedMode`）
 * - 自身 none → 沿祖先找最近 `on`+date；遇滚动祖先则停止（无日期可继）
 * 不改写物理 `plannedDate`（SP-INH-PLAN-IMMUT）。
 */
export function effectivePlannedDate(task: EntityRowOf<'task'>, tree: TaskTree): Iso {
  const selfMode = task.data.plannedMode ?? PLANNED_MODE.NONE
  if (selfMode === PLANNED_MODE.ON)
    return task.data.plannedDate
  if (selfMode === PLANNED_MODE.ROLLING)
    return null
  for (const anc of ancestors(tree, task.id)) {
    const mode = anc.data.plannedMode ?? PLANNED_MODE.NONE
    if (mode === PLANNED_MODE.ON)
      return anc.data.plannedDate
    if (mode === PLANNED_MODE.ROLLING)
      return null
  }
  return null
}
