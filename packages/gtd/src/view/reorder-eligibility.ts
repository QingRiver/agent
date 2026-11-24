import type { EntityRowOf } from '../data/row-schema'
import { siblingKey } from '../state/tree'

/**
 * 当前屏上允许手动排序的任务 id：其兄弟组（同 {@link siblingKey}）人数 ≥ 2，
 * 且该组全部 live 成员都在 `visibleIds` 中（避免 A/C 可见、B 被 filter 藏起仍能对拖）。
 */
export function fullyVisibleSiblingReorderIds(
  visibleIds: readonly string[],
  liveTasks: readonly EntityRowOf<'task'>[],
): Set<string> {
  const visible = new Set(visibleIds)
  const byKey = new Map<string, EntityRowOf<'task'>[]>()
  for (const t of liveTasks) {
    const k = siblingKey(t.data.mountDirId, t.data.parentId)
    const group = byKey.get(k)
    if (group)
      group.push(t)
    else
      byKey.set(k, [t])
  }
  const out = new Set<string>()
  for (const group of byKey.values()) {
    if (group.length < 2)
      continue
    if (!group.every(t => visible.has(t.id)))
      continue
    for (const t of group)
      out.add(t.id)
  }
  return out
}
