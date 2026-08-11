/**
 * defer ≤ due 写路径规范化（wiki §1.1.1「截止不能早于解锁开始」）。
 * 与 Forecast 栏位正交：入库假定已满足；展示层不处理非法 defer>due。
 * `plannedDate` 不参与本联动。
 */

/** 当前已落库（或合并前）的 defer/due 对 */
export interface DeferDuePair {
  deferDate: string | null
  dueDate: string | null
}

/** 本次 patch 触及的字段（用 `Object.hasOwn` 区分「未写」与「写 null」） */
export interface DeferDuePatch {
  deferDate?: string | null
  dueDate?: string | null
}

/**
 * 将 `current ⊕ patch` 规范为合法 defer/due（瞬时比较，相等合法）。
 * - 任一侧 null / 仅一侧有值：不联动
 * - defer ≤ due：保持
 * - 冲突后写优先：只改 defer → due=defer；只改 due → defer=due；同 patch 皆改仍非法 → due=defer
 */
export function normalizeDeferDue(
  current: DeferDuePair,
  patch: DeferDuePatch,
): DeferDuePair {
  const touchedDefer = Object.hasOwn(patch, 'deferDate')
  const touchedDue = Object.hasOwn(patch, 'dueDate')
  const next: DeferDuePair = {
    deferDate: touchedDefer ? (patch.deferDate ?? null) : current.deferDate,
    dueDate: touchedDue ? (patch.dueDate ?? null) : current.dueDate,
  }
  if (next.deferDate == null || next.dueDate == null)
    return next
  const deferMs = new Date(next.deferDate).getTime()
  const dueMs = new Date(next.dueDate).getTime()
  if (deferMs <= dueMs)
    return next
  if (touchedDefer && !touchedDue)
    return { deferDate: next.deferDate, dueDate: next.deferDate }
  if (touchedDue && !touchedDefer)
    return { deferDate: next.dueDate, dueDate: next.dueDate }
  return { deferDate: next.deferDate, dueDate: next.deferDate }
}
