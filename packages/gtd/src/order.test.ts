import { describe, expect, it } from 'vitest'
import {
  MIN_ORDER_GAP,
  orderBetween,
  OrderError,
  reindexSiblings,
  shouldReindex,
} from './order'

describe('orderBetween', () => {
  it('空集合返回 0', () => {
    expect(orderBetween(null, null)).toBe(0)
  })

  it('插入第一个元素前', () => {
    expect(orderBetween(null, 5)).toBe(4)
    expect(orderBetween(null, 0)).toBe(-1)
    expect(orderBetween(null, -2.5)).toBe(-3.5)
  })

  it('插入最后一个元素后', () => {
    expect(orderBetween(10, null)).toBe(11)
    expect(orderBetween(0, null)).toBe(1)
    expect(orderBetween(-3, null)).toBe(-2)
  })

  it('插入两项之间', () => {
    expect(orderBetween(1, 3)).toBe(2)
    expect(orderBetween(1, 2)).toBe(1.5)
    expect(orderBetween(0, 1)).toBe(0.5)
  })

  it('连续向同一间隙插入', () => {
    let before = 0
    const after = 1
    const values: number[] = []

    for (let i = 0; i < 20; i++) {
      const next = orderBetween(before, after)
      expect(next).toBeGreaterThan(before)
      expect(next).toBeLessThan(after)
      values.push(next)
      before = next
    }

    for (let i = 1; i < values.length; i++)
      expect(values[i]!).toBeGreaterThan(values[i - 1]!)
  })

  it('before >= after 时抛出', () => {
    expect(() => orderBetween(5, 3)).toThrow(OrderError)
    expect(() => orderBetween(5, 5)).toThrow(OrderError)
    expect(() => orderBetween(3, 3)).toThrow(/before .* must be less than after/)
  })

  it('非有限端点抛出', () => {
    expect(() => orderBetween(Number.NaN, null)).toThrow(OrderError)
    expect(() => orderBetween(null, Number.POSITIVE_INFINITY)).toThrow(OrderError)
    expect(() => orderBetween(1, Number.NEGATIVE_INFINITY)).toThrow(OrderError)
    expect(() => orderBetween(Number.NaN, 2)).toThrow(OrderError)
  })

  it('不静默交换参数', () => {
    expect(() => orderBetween(10, 2)).toThrow(OrderError)
    expect(orderBetween(2, 10)).toBe(6)
  })
})

describe('shouldReindex', () => {
  it('正常间隙不需要 reindex', () => {
    expect(shouldReindex(0, 1)).toBe(false)
    expect(shouldReindex(1, 3)).toBe(false)
    expect(shouldReindex(1.5, 2.5)).toBe(false)
  })

  it('间隙小于阈值时需要 reindex', () => {
    const before = 1
    const after = before + MIN_ORDER_GAP / 2
    expect(shouldReindex(before, after)).toBe(true)
  })

  it('中点与端点重合时需要 reindex', () => {
    expect(shouldReindex(0, Number.EPSILON)).toBe(true)
  })

  it('非法端点抛出', () => {
    expect(() => shouldReindex(5, 3)).toThrow(OrderError)
    expect(() => shouldReindex(Number.NaN, 2)).toThrow(OrderError)
    expect(() => shouldReindex(1, Number.POSITIVE_INFINITY)).toThrow(OrderError)
  })
})

describe('reindexSiblings', () => {
  it('按稳定顺序写为 0, 1, 2, ...', () => {
    const items = [
      { id: 'c', order: 30 },
      { id: 'a', order: 10 },
      { id: 'b', order: 20 },
    ]
    const map = reindexSiblings(items)
    expect(map.get('a')).toBe(0)
    expect(map.get('b')).toBe(1)
    expect(map.get('c')).toBe(2)
  })

  it('相同 order 时保持输入稳定顺序', () => {
    const items = [
      { id: 'first', order: 1 },
      { id: 'second', order: 1 },
      { id: 'third', order: 1 },
    ]
    const map = reindexSiblings(items)
    expect([...map.entries()]).toEqual([
      ['first', 0],
      ['second', 1],
      ['third', 2],
    ])
  })

  it('支持自定义 start 与 step', () => {
    const items = [
      { id: 'a', order: 2 },
      { id: 'b', order: 1 },
    ]
    const map = reindexSiblings(items, 10, 5)
    expect(map.get('b')).toBe(10)
    expect(map.get('a')).toBe(15)
  })

  it('结果有限且严格单调', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `id-${i}`,
      order: Math.random(),
    }))
    const map = reindexSiblings(items)
    const values = items.map(item => map.get(item.id) as number)

    for (const value of values)
      expect(Number.isFinite(value)).toBe(true)

    const sorted = [...values].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++)
      expect(sorted[i]!).toBeGreaterThan(sorted[i - 1]!)
  })

  it('空列表返回空 Map', () => {
    expect(reindexSiblings([])).toEqual(new Map())
  })

  it('非法 start/step 抛出', () => {
    expect(() => reindexSiblings([{ id: 'a', order: 0 }], Number.NaN)).toThrow(OrderError)
    expect(() => reindexSiblings([{ id: 'a', order: 0 }], 0, 0)).toThrow(OrderError)
    expect(() => reindexSiblings([{ id: 'a', order: 0 }], 0, -1)).toThrow(OrderError)
  })
})

describe('reindex then orderBetween', () => {
  it('reindex 后可继续插入', () => {
    const siblings = [
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
    ]

    for (let i = 0; i < 60; i++) {
      siblings.sort((a, b) => a.order - b.order)
      const insertAt = 1
      let before = siblings[insertAt - 1]!.order
      let after = siblings[insertAt]!.order

      if (shouldReindex(before, after)) {
        const nextOrders = reindexSiblings(siblings)
        for (const sibling of siblings)
          sibling.order = nextOrders.get(sibling.id) as number
        siblings.sort((a, b) => a.order - b.order)
        before = siblings[insertAt - 1]!.order
        after = siblings[insertAt]!.order
      }

      const inserted = orderBetween(before, after)
      siblings.splice(insertAt, 0, { id: `x-${i}`, order: inserted })
    }

    siblings.sort((a, b) => a.order - b.order)
    const orders = siblings.map(s => s.order)
    for (let i = 1; i < orders.length; i++)
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!)
  })
})
