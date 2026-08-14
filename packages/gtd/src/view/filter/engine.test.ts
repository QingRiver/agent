import type { EntityRow, EntityRowOf } from '../../data/sync-schema'
import type { FilterEvalContext } from './engine'
import type { FilterNode } from './schema'
import { describe, expect, it } from 'vitest'
import { RowStore } from '../../data/rows'
import { EXPLICIT_STATUS } from '../../data/types'
import { makeTaskRow, makeTaskTagRow, NOW } from '../../fixtures'
import { buildTaskTree } from '../../structure/tree'
import { evalNode, matchFilter } from './engine'
import { FILTER_FIELD, LEAF_OP, LOGIC_OP } from './schema'

function ctx(rows: EntityRow[] = [], projectOf?: (t: EntityRowOf<'task'>) => string | null): FilterEvalContext {
  return projectOf
    ? { rowStore: new RowStore(rows), projectOf }
    : { rowStore: new RowStore(rows) }
}

function leaf(field: string, op: string, value?: unknown): FilterNode {
  return (value === undefined ? { op, field } : { op, field, value }) as FilterNode
}

describe('evalNode - 叶子: status', () => {
  it('is 命中', () => {
    const t = makeTaskRow('t1', { status: EXPLICIT_STATUS.ACTIVE })
    expect(evalNode(t, leaf(FILTER_FIELD.STATUS, LEAF_OP.IS, EXPLICIT_STATUS.ACTIVE), ctx())).toBe(true)
  })
  it('is 不命中', () => {
    const t = makeTaskRow('t1', { status: EXPLICIT_STATUS.COMPLETED })
    expect(evalNode(t, leaf(FILTER_FIELD.STATUS, LEAF_OP.IS, EXPLICIT_STATUS.ACTIVE), ctx())).toBe(false)
  })
  it('is_not 命中', () => {
    const t = makeTaskRow('t1', { status: EXPLICIT_STATUS.COMPLETED })
    expect(evalNode(t, leaf(FILTER_FIELD.STATUS, LEAF_OP.IS_NOT, EXPLICIT_STATUS.ACTIVE), ctx())).toBe(true)
  })
})

describe('evalNode - 叶子: flagged', () => {
  it('is true 命中', () => {
    const t = makeTaskRow('t1', { flagged: true })
    expect(evalNode(t, leaf(FILTER_FIELD.FLAGGED, LEAF_OP.IS, true), ctx())).toBe(true)
  })
  it('is_not true 在 false 时命中', () => {
    const t = makeTaskRow('t1', { flagged: false })
    expect(evalNode(t, leaf(FILTER_FIELD.FLAGGED, LEAF_OP.IS_NOT, true), ctx())).toBe(true)
  })
})

describe('evalNode - 叶子: project/tag (some/empty)', () => {
  it('project some 命中', () => {
    const t = makeTaskRow('t1', { mountDirId: 'p1' })
    expect(evalNode(t, leaf(FILTER_FIELD.PROJECT, LEAF_OP.SOME, ['p1', 'p2']), ctx([t], () => 'p1'))).toBe(true)
  })
  it('project some 不命中', () => {
    const t = makeTaskRow('t1', { mountDirId: 'p9' })
    expect(evalNode(t, leaf(FILTER_FIELD.PROJECT, LEAF_OP.SOME, ['p1', 'p2']), ctx([t], () => 'p9'))).toBe(false)
  })
  it('project empty 命中（无项目）', () => {
    const t = makeTaskRow('t1', { mountDirId: null })
    expect(evalNode(t, leaf(FILTER_FIELD.PROJECT, LEAF_OP.EMPTY), ctx([t], () => null))).toBe(true)
  })
  it('project empty 不命中（有项目）', () => {
    const t = makeTaskRow('t1', { mountDirId: 'p1' })
    expect(evalNode(t, leaf(FILTER_FIELD.PROJECT, LEAF_OP.EMPTY), ctx([t], () => 'p1'))).toBe(false)
  })
  it('tag some 交集命中', () => {
    const t = makeTaskRow('t1')
    const c = ctx([t, makeTaskTagRow('t1', 'g1'), makeTaskTagRow('t1', 'g3')])
    expect(evalNode(t, leaf(FILTER_FIELD.TAG, LEAF_OP.SOME, ['g1', 'g2']), c)).toBe(true)
  })
  it('tag some 无交集不命中', () => {
    const t = makeTaskRow('t1')
    const c = ctx([t, makeTaskTagRow('t1', 'g9')])
    expect(evalNode(t, leaf(FILTER_FIELD.TAG, LEAF_OP.SOME, ['g1', 'g2']), c)).toBe(false)
  })
  it('tag empty 命中（无标签）', () => {
    const t = makeTaskRow('t1')
    expect(evalNode(t, leaf(FILTER_FIELD.TAG, LEAF_OP.EMPTY), ctx())).toBe(true)
  })
  it('tag some：子无物理标 → 不读父标（入组复制后才有 task_tag）', () => {
    const parent = makeTaskRow('p')
    const child = makeTaskRow('c', { parentId: 'p' })
    const rows = [parent, child, makeTaskTagRow('p', 'g1')]
    const c: FilterEvalContext = { rowStore: new RowStore(rows), tree: buildTaskTree([parent, child]) }
    expect(evalNode(child, leaf(FILTER_FIELD.TAG, LEAF_OP.SOME, ['g1']), c)).toBe(false)
    expect(evalNode(child, leaf(FILTER_FIELD.TAG, LEAF_OP.EMPTY), c)).toBe(true)
  })
})

describe('evalNode - 叶子: 日期 (before/after/within/exist)', () => {
  const base = NOW.toISOString()
  const later = new Date(NOW.getTime() + 86400000).toISOString()
  const earlier = new Date(NOW.getTime() - 86400000).toISOString()

  it('dueDate before 命中', () => {
    const t = makeTaskRow('t1', { dueDate: earlier })
    expect(evalNode(t, leaf(FILTER_FIELD.DUE_DATE, LEAF_OP.BEFORE, base), ctx())).toBe(true)
  })
  it('dueDate after 命中', () => {
    const t = makeTaskRow('t1', { dueDate: later })
    expect(evalNode(t, leaf(FILTER_FIELD.DUE_DATE, LEAF_OP.AFTER, base), ctx())).toBe(true)
  })
  it('dueDate within 命中', () => {
    const t = makeTaskRow('t1', { dueDate: base })
    expect(evalNode(t, leaf(FILTER_FIELD.DUE_DATE, LEAF_OP.WITHIN, [earlier, later]), ctx())).toBe(true)
  })
  it('dueDate within 边界外不命中', () => {
    const t = makeTaskRow('t1', { dueDate: earlier })
    expect(evalNode(t, leaf(FILTER_FIELD.DUE_DATE, LEAF_OP.WITHIN, [base, later]), ctx())).toBe(false)
  })
  it('dueDate exist 命中', () => {
    const t = makeTaskRow('t1', { dueDate: base })
    expect(evalNode(t, leaf(FILTER_FIELD.DUE_DATE, LEAF_OP.EXIST), ctx())).toBe(true)
  })
  it('dueDate exist 为空不命中', () => {
    const t = makeTaskRow('t1', { dueDate: null })
    expect(evalNode(t, leaf(FILTER_FIELD.DUE_DATE, LEAF_OP.EXIST), ctx())).toBe(false)
  })
  it('dueDate before 对 null 值不命中', () => {
    const t = makeTaskRow('t1', { dueDate: null })
    expect(evalNode(t, leaf(FILTER_FIELD.DUE_DATE, LEAF_OP.BEFORE, base), ctx())).toBe(false)
  })
  it('dueDate exist：子无物理 due + tree → 继承父 effectiveDue', () => {
    const parent = makeTaskRow('p', { dueDate: base })
    const child = makeTaskRow('c', { parentId: 'p', dueDate: null })
    const c: FilterEvalContext = {
      rowStore: new RowStore([parent, child]),
      tree: buildTaskTree([parent, child]),
    }
    expect(evalNode(child, leaf(FILTER_FIELD.DUE_DATE, LEAF_OP.EXIST), c)).toBe(true)
    expect(evalNode(child, leaf(FILTER_FIELD.DUE_DATE, LEAF_OP.EXIST), ctx([child]))).toBe(false)
  })
  it('deferDate exist：子无物理 defer + tree → 继承父 effectiveDefer', () => {
    const parent = makeTaskRow('p', { deferDate: earlier })
    const child = makeTaskRow('c', { parentId: 'p', deferDate: null })
    const c: FilterEvalContext = {
      rowStore: new RowStore([parent, child]),
      tree: buildTaskTree([parent, child]),
    }
    expect(evalNode(child, leaf(FILTER_FIELD.DEFER_DATE, LEAF_OP.EXIST), c)).toBe(true)
  })
})

describe('evalNode - 叶子: estimate', () => {
  it('is 命中', () => {
    const t = makeTaskRow('t1', { estimateMinutes: 30 })
    expect(evalNode(t, leaf(FILTER_FIELD.ESTIMATE, LEAF_OP.IS, 30), ctx())).toBe(true)
  })
  it('before 命中', () => {
    const t = makeTaskRow('t1', { estimateMinutes: 15 })
    expect(evalNode(t, leaf(FILTER_FIELD.ESTIMATE, LEAF_OP.BEFORE, 30), ctx())).toBe(true)
  })
  it('within 命中', () => {
    const t = makeTaskRow('t1', { estimateMinutes: 45 })
    expect(evalNode(t, leaf(FILTER_FIELD.ESTIMATE, LEAF_OP.WITHIN, [30, 60]), ctx())).toBe(true)
  })
  it('exist 为 null 不命中', () => {
    const t = makeTaskRow('t1', { estimateMinutes: null })
    expect(evalNode(t, leaf(FILTER_FIELD.ESTIMATE, LEAF_OP.EXIST), ctx())).toBe(false)
  })
})

describe('evalNode - 逻辑组合', () => {
  it('and 全命中', () => {
    const t = makeTaskRow('t1', { flagged: true, status: EXPLICIT_STATUS.ACTIVE })
    const node: FilterNode = {
      op: LOGIC_OP.AND,
      children: [
        leaf(FILTER_FIELD.FLAGGED, LEAF_OP.IS, true),
        leaf(FILTER_FIELD.STATUS, LEAF_OP.IS, EXPLICIT_STATUS.ACTIVE),
      ],
    }
    expect(evalNode(t, node, ctx())).toBe(true)
  })
  it('and 部分不命中', () => {
    const t = makeTaskRow('t1', { flagged: false, status: EXPLICIT_STATUS.ACTIVE })
    const node: FilterNode = {
      op: LOGIC_OP.AND,
      children: [
        leaf(FILTER_FIELD.FLAGGED, LEAF_OP.IS, true),
        leaf(FILTER_FIELD.STATUS, LEAF_OP.IS, EXPLICIT_STATUS.ACTIVE),
      ],
    }
    expect(evalNode(t, node, ctx())).toBe(false)
  })
  it('or 任一命中', () => {
    const t = makeTaskRow('t1', { flagged: false, status: EXPLICIT_STATUS.COMPLETED })
    const node: FilterNode = {
      op: LOGIC_OP.OR,
      children: [
        leaf(FILTER_FIELD.FLAGGED, LEAF_OP.IS, true),
        leaf(FILTER_FIELD.STATUS, LEAF_OP.IS, EXPLICIT_STATUS.COMPLETED),
      ],
    }
    expect(evalNode(t, node, ctx())).toBe(true)
  })
  it('or 全不命中', () => {
    const t = makeTaskRow('t1', { flagged: false, status: EXPLICIT_STATUS.ACTIVE })
    const node: FilterNode = {
      op: LOGIC_OP.OR,
      children: [
        leaf(FILTER_FIELD.FLAGGED, LEAF_OP.IS, true),
        leaf(FILTER_FIELD.STATUS, LEAF_OP.IS, EXPLICIT_STATUS.COMPLETED),
      ],
    }
    expect(evalNode(t, node, ctx())).toBe(false)
  })
  it('not 取反', () => {
    const t = makeTaskRow('t1', { flagged: false })
    const child = leaf(FILTER_FIELD.FLAGGED, LEAF_OP.IS, true)
    const node: FilterNode = { op: LOGIC_OP.NOT, child }
    expect(evalNode(t, node, ctx())).toBe(true)
  })
})

describe('evalNode - 嵌套混合', () => {
  it('(flagged AND dueDate within) OR (project some [X] AND NOT tag some [Y])', () => {
    const base = NOW.toISOString()
    const earlier = new Date(NOW.getTime() - 86400000).toISOString()
    const later = new Date(NOW.getTime() + 86400000).toISOString()
    const node: FilterNode = {
      op: LOGIC_OP.OR,
      children: [
        {
          op: LOGIC_OP.AND,
          children: [
            leaf(FILTER_FIELD.FLAGGED, LEAF_OP.IS, true),
            leaf(FILTER_FIELD.DUE_DATE, LEAF_OP.WITHIN, [earlier, later]),
          ],
        },
        {
          op: LOGIC_OP.AND,
          children: [
            leaf(FILTER_FIELD.PROJECT, LEAF_OP.SOME, ['pX']),
            { op: LOGIC_OP.NOT, child: leaf(FILTER_FIELD.TAG, LEAF_OP.SOME, ['gY']) },
          ],
        },
      ],
    }
    // 左支命中
    expect(evalNode(makeTaskRow('t1', { flagged: true, dueDate: base }), node, ctx())).toBe(true)
    // 右支命中（project=pX 且无 gY 标签）
    expect(evalNode(makeTaskRow('t2', { mountDirId: 'pX' }), node, ctx([], () => 'pX'))).toBe(true)
    // 右支 NOT 不成立（有 gY）
    expect(evalNode(makeTaskRow('t3', { mountDirId: 'pX' }), node, ctx([makeTaskRow('t3'), makeTaskTagRow('t3', 'gY')], () => 'pX'))).toBe(false)
    // 两支都不命中
    expect(evalNode(makeTaskRow('t4', { flagged: false, mountDirId: 'pZ' }), node, ctx([], () => 'pZ'))).toBe(false)
  })
})

describe('evalNode - 短路', () => {
  it('and 遇 false 短路', () => {
    const t = makeTaskRow('t1', { flagged: false })
    const a = leaf(FILTER_FIELD.FLAGGED, LEAF_OP.IS, true)
    const b = leaf(FILTER_FIELD.STATUS, LEAF_OP.IS, EXPLICIT_STATUS.ACTIVE)
    const node: FilterNode = { op: LOGIC_OP.AND, children: [a, b] }
    expect(evalNode(t, node, ctx())).toBe(false)
  })
  it('or 遇 true 短路', () => {
    const t = makeTaskRow('t1', { flagged: true })
    const a = leaf(FILTER_FIELD.FLAGGED, LEAF_OP.IS, true)
    const b = leaf(FILTER_FIELD.STATUS, LEAF_OP.IS, EXPLICIT_STATUS.COMPLETED)
    const node: FilterNode = { op: LOGIC_OP.OR, children: [a, b] }
    expect(evalNode(t, node, ctx())).toBe(true)
  })
})

describe('matchFilter', () => {
  it('null 节点全命中', () => {
    expect(matchFilter(makeTaskRow('t1'), null, ctx())).toBe(true)
  })
})
