import type { EntityRowOf } from '../data/sync-schema'

/** 兄弟序作用域：同挂载 + 同父（根任务 parentId=null 时靠 mountDirId 分桶）。 */
export function taskSiblingKey(task: {
  mountDirId: string | null
  parentId: string | null
}): string {
  return `${task.mountDirId ?? ''}\0${task.parentId ?? ''}`
}

/**
 * 当前屏上允许手动排序的任务 id：其兄弟组（同 {@link taskSiblingKey}）人数 ≥ 2，
 * 且该组全部 live 成员都在 `visibleIds` 中（避免 A/C 可见、B 被 filter 藏起仍能对拖）。
 */
export function fullyVisibleSiblingReorderIds(
  visibleIds: readonly string[],
  liveTasks: readonly EntityRowOf<'task'>[],
): Set<string> {
  const visible = new Set(visibleIds)
  const byKey = new Map<string, EntityRowOf<'task'>[]>()
  for (const t of liveTasks) {
    const k = taskSiblingKey(t.data)
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
