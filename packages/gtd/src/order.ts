/**
 * Fractional order helpers for sibling reordering.
 */

/** Minimum gap between neighbors before a sibling reindex is required. */
export const MIN_ORDER_GAP = 1e-9

export class OrderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OrderError'
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value))
    throw new OrderError(`${label} must be a finite number, got ${value}`)
}

function midpoint(before: number, after: number): number {
  return (before + after) / 2
}

/**
 * Compute a fractional order between two neighbors.
 *
 * | Insert position | Calculation |
 * |-----------------|-------------|
 * | Empty set       | `0`         |
 * | Before first    | `after - 1` |
 * | After last      | `before + 1`|
 * | Between two     | `(before + after) / 2` |
 *
 * When both endpoints are numbers, `before` must be strictly less than `after`.
 */
export function orderBetween(
  before: number | null,
  after: number | null,
): number {
  if (before === null && after === null)
    return 0

  if (before === null) {
    assertFinite(after as number, 'after')
    return (after as number) - 1
  }

  if (after === null) {
    assertFinite(before, 'before')
    return before + 1
  }

  assertFinite(before, 'before')
  assertFinite(after, 'after')

  if (before >= after)
    throw new OrderError(`before (${before}) must be less than after (${after})`)

  const value = midpoint(before, after)
  if (!Number.isFinite(value))
    throw new OrderError(`computed order is not finite for before=${before}, after=${after}`)

  return value
}

/**
 * Whether the gap between two neighbors is too small for another fractional insert.
 */
export function shouldReindex(before: number, after: number): boolean {
  assertFinite(before, 'before')
  assertFinite(after, 'after')

  if (before >= after)
    throw new OrderError(`before (${before}) must be less than after (${after})`)

  const gap = after - before
  if (!Number.isFinite(gap) || gap < MIN_ORDER_GAP)
    return true

  const value = midpoint(before, after)
  if (!Number.isFinite(value))
    return true

  return value === before || value === after
}

/**
 * Reassign sibling orders to `start, start + step, start + 2 * step, ...`
 * in current stable sort order.
 */
export function reindexSiblings<T extends { id: string, order: number }>(
  items: T[],
  start = 0,
  step = 1,
): Map<string, number> {
  if (!Number.isFinite(start) || !Number.isFinite(step) || step <= 0)
    throw new OrderError('start and step must be finite numbers with step > 0')

  const indexed = items.map((item, index) => ({ item, index }))
  indexed.sort((a, b) => {
    if (a.item.order !== b.item.order)
      return a.item.order - b.item.order
    return a.index - b.index
  })

  const result = new Map<string, number>()
  for (let i = 0; i < indexed.length; i++)
    result.set(indexed[i]!.item.id, start + i * step)

  return result
}
