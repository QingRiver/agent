import { orderBetween, reindexSiblings, shouldReindex } from '../../structure/order'

export function nextOrder(items: Array<{ order: number }>): number {
  if (items.length === 0)
    return 0
  return Math.max(...items.map(i => i.order)) + 1
}

export function sortedByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order)
}

/** 在 before/after 同级锚点之间插入；必要时整组 reindex。 */
export function targetOrder<T extends { id: string, order: number }>(
  siblings: T[],
  beforeId: string | null,
  afterId: string | null,
): { order: number, reindexed: Map<string, number> } {
  const before = beforeId ? siblings.find(item => item.id === beforeId) : null
  const after = afterId ? siblings.find(item => item.id === afterId) : null
  if (beforeId && !before)
    throw new Error(`找不到前一个同级项 ${beforeId}`)
  if (afterId && !after)
    throw new Error(`找不到后一个同级项 ${afterId}`)
  if (before && after && shouldReindex(before.order, after.order)) {
    const reindexed = reindexSiblings(siblings)
    return {
      order: orderBetween(reindexed.get(before.id)!, reindexed.get(after.id)!),
      reindexed,
    }
  }
  return {
    order: orderBetween(before?.order ?? null, after?.order ?? null),
    reindexed: new Map(),
  }
}
