import { describe, expect, it } from 'vitest'
import {
  DUE_SOON_MS,
  makeDoc,
  makeFilterRule,
  makePerspective,
  makeSortKey,
  makeTask,
  NOW,
} from './__tests__/fixtures'
import {
  applyAvailabilityFilter,
  applyBuiltinFilter,
  builtinPerspectives,
  evaluateFilter,
  expandAncestors,
  groupBy,
  matchFilters,
  renderPerspective,
  sortTasks,
} from './perspective'
import { buildTaskTree } from './tree'
import {
  AVAILABILITY_FILTER,
  EXPLICIT_STATUS,
  FILTER_FIELD,
  FILTER_OP,
  GROUP_KEY,
  PERSPECTIVE_MATCH,
  SORT_FIELD,
} from './types'

describe('evaluateFilter', () => {
  it('status eq 命中', () => {
    const t = makeTask({ status: EXPLICIT_STATUS.ACTIVE })
    const rule = makeFilterRule({
      field: FILTER_FIELD.STATUS,
      op: FILTER_OP.EQ,
      value: EXPLICIT_STATUS.ACTIVE,
    })
    expect(evaluateFilter(t, rule, makeDoc({ tasks: [t] }), NOW, DUE_SOON_MS)).toBe(true)
  })

  it('tag in 命中', () => {
    const t = makeTask({ tagIds: ['tag-1'] })
    const rule = makeFilterRule({
      field: FILTER_FIELD.TAG,
      op: FILTER_OP.IN,
      value: ['tag-1'],
    })
    expect(evaluateFilter(t, rule, makeDoc({ tasks: [t] }), NOW, DUE_SOON_MS)).toBe(true)
  })

  it('dueDate between 命中', () => {
    const t = makeTask({ dueDate: new Date(NOW.getTime() + 3600000).toISOString() })
    const rule = makeFilterRule({
      field: FILTER_FIELD.DUE_DATE,
      op: FILTER_OP.BETWEEN,
      value: [NOW.toISOString(), new Date(NOW.getTime() + 86400000).toISOString()],
    })
    expect(evaluateFilter(t, rule, makeDoc({ tasks: [t] }), NOW, DUE_SOON_MS)).toBe(true)
  })

  it('flagged eq true 命中', () => {
    const t = makeTask({ flagged: true })
    const rule = makeFilterRule({
      field: FILTER_FIELD.FLAGGED,
      op: FILTER_OP.EQ,
      value: true,
    })
    expect(evaluateFilter(t, rule, makeDoc({ tasks: [t] }), NOW, DUE_SOON_MS)).toBe(true)
  })

  it('status scalar in 命中', () => {
    const t = makeTask({ status: EXPLICIT_STATUS.ACTIVE })
    const rule = makeFilterRule({
      field: FILTER_FIELD.STATUS,
      op: FILTER_OP.IN,
      value: [EXPLICIT_STATUS.ACTIVE, EXPLICIT_STATUS.COMPLETED],
    })
    expect(evaluateFilter(t, rule, makeDoc({ tasks: [t] }), NOW, DUE_SOON_MS)).toBe(true)
  })

  it('tag eq 按包含语义命中', () => {
    const t = makeTask({ tagIds: ['tag-1', 'tag-2'] })
    const rule = makeFilterRule({
      field: FILTER_FIELD.TAG,
      op: FILTER_OP.EQ,
      value: 'tag-2',
    })
    expect(evaluateFilter(t, rule, makeDoc({ tasks: [t] }), NOW, DUE_SOON_MS)).toBe(true)
  })

  it('tag ne 未包含时命中', () => {
    const t = makeTask({ tagIds: ['tag-1'] })
    const rule = makeFilterRule({
      field: FILTER_FIELD.TAG,
      op: FILTER_OP.NE,
      value: 'tag-2',
    })
    expect(evaluateFilter(t, rule, makeDoc({ tasks: [t] }), NOW, DUE_SOON_MS)).toBe(true)
  })

  it('estimate before 不走日期解析', () => {
    const t = makeTask({ estimateMinutes: 30 })
    const rule = makeFilterRule({
      field: FILTER_FIELD.ESTIMATE,
      op: FILTER_OP.BEFORE,
      value: 60,
    })
    expect(evaluateFilter(t, rule, makeDoc({ tasks: [t] }), NOW, DUE_SOON_MS)).toBe(true)
  })

  it('estimate between 数值区间', () => {
    const t = makeTask({ estimateMinutes: 45 })
    const rule = makeFilterRule({
      field: FILTER_FIELD.ESTIMATE,
      op: FILTER_OP.BETWEEN,
      value: [30, 60],
    })
    expect(evaluateFilter(t, rule, makeDoc({ tasks: [t] }), NOW, DUE_SOON_MS)).toBe(true)
  })

  it('tag isNull 空数组视为无标签', () => {
    const t = makeTask({ tagIds: [] })
    const rule = makeFilterRule({
      field: FILTER_FIELD.TAG,
      op: FILTER_OP.IS_NULL,
      value: null,
    })
    expect(evaluateFilter(t, rule, makeDoc({ tasks: [t] }), NOW, DUE_SOON_MS)).toBe(true)
  })
})

describe('matchFilters', () => {
  const flaggedRule = makeFilterRule({
    field: FILTER_FIELD.FLAGGED,
    op: FILTER_OP.EQ,
    value: true,
  })
  const completedRule = makeFilterRule({
    field: FILTER_FIELD.STATUS,
    op: FILTER_OP.EQ,
    value: EXPLICIT_STATUS.COMPLETED,
  })

  it('all: 全部满足才命中', () => {
    const t = makeTask({ flagged: true, status: EXPLICIT_STATUS.ACTIVE })
    const doc = makeDoc({ tasks: [t] })
    const matched = matchFilters(
      t,
      [flaggedRule, completedRule],
      PERSPECTIVE_MATCH.ALL,
      doc,
      NOW,
      DUE_SOON_MS,
    )
    expect(matched).toBe(false)
  })

  it('any: 任一满足即命中', () => {
    const t = makeTask({ flagged: true, status: EXPLICIT_STATUS.ACTIVE })
    const doc = makeDoc({ tasks: [t] })
    const matched = matchFilters(
      t,
      [flaggedRule, completedRule],
      PERSPECTIVE_MATCH.ANY,
      doc,
      NOW,
      DUE_SOON_MS,
    )
    expect(matched).toBe(true)
  })
})

describe('applyAvailabilityFilter', () => {
  it('due_soon 在 available 档保留', () => {
    const dueSoon = makeTask({
      id: 'a',
      dueDate: new Date(NOW.getTime() + DUE_SOON_MS / 2).toISOString(),
    })
    const tree = buildTaskTree([dueSoon])
    const out = applyAvailabilityFilter(
      [dueSoon],
      AVAILABILITY_FILTER.AVAILABLE,
      tree,
      NOW,
      DUE_SOON_MS,
    )
    expect(out.map(t => t.id)).toEqual(['a'])
  })

  it('blocked 在 available 档排除', () => {
    const avail = makeTask({ id: 'a' })
    const blocked = makeTask({ id: 'b', deferDate: new Date(NOW.getTime() + 60000).toISOString() })
    const tree = buildTaskTree([avail, blocked])
    const out = applyAvailabilityFilter(
      [avail, blocked],
      AVAILABILITY_FILTER.AVAILABLE,
      tree,
      NOW,
      DUE_SOON_MS,
    )
    expect(out.map(t => t.id)).toEqual(['a'])
  })

  it('remaining: 所有 active', () => {
    const t = makeTask({ id: 'a', status: EXPLICIT_STATUS.ACTIVE })
    const tree = buildTaskTree([t])
    const out = applyAvailabilityFilter(
      [t],
      AVAILABILITY_FILTER.REMAINING,
      tree,
      NOW,
      DUE_SOON_MS,
    )
    expect(out).toHaveLength(1)
  })

  it('all: 全部', () => {
    const t = makeTask({ id: 'a', status: EXPLICIT_STATUS.COMPLETED })
    const tree = buildTaskTree([t])
    const out = applyAvailabilityFilter(
      [t],
      AVAILABILITY_FILTER.ALL,
      tree,
      NOW,
      DUE_SOON_MS,
    )
    expect(out).toHaveLength(1)
  })
})

describe('expandAncestors', () => {
  it('补齐祖先链', () => {
    const root = makeTask({ id: 'r', groupType: 'parallel' })
    const child = makeTask({ id: 'c', parentId: 'r' })
    const tree = buildTaskTree([root, child])
    expect(expandAncestors(['c'], tree).sort()).toEqual(['c', 'r'])
  })
})

describe('groupBy', () => {
  const renderCtx = (tasks: ReturnType<typeof makeTask>[]) => ({
    doc: makeDoc({ tasks }),
    tree: buildTaskTree(tasks),
    now: NOW,
    dueSoonIntervalMs: DUE_SOON_MS,
    statusCache: new Map(),
  })

  it('按 project 分组', () => {
    const t1 = makeTask({ id: 'a', projectId: 'p1' })
    const t2 = makeTask({ id: 'b', projectId: 'p2' })
    const ctx = renderCtx([t1, t2])
    const groups = groupBy([t1, t2], [GROUP_KEY.PROJECT], ctx.doc, ctx)
    expect(groups).toHaveLength(2)
  })

  it('tag 多归属：一 task 进多组', () => {
    const t = makeTask({ id: 'a', tagIds: ['t1', 't2'] })
    const ctx = renderCtx([t])
    const groups = groupBy([t], [GROUP_KEY.TAG], ctx.doc, ctx)
    expect(groups).toHaveLength(2)
  })
})

describe('sortTasks', () => {
  it('dueDate 升序，null 末尾', () => {
    const t1 = makeTask({ id: 'a', dueDate: null })
    const t2 = makeTask({ id: 'b', dueDate: new Date('2026-07-20T00:00:00Z').toISOString() })
    const t3 = makeTask({ id: 'c', dueDate: new Date('2026-07-10T00:00:00Z').toISOString() })
    const sortBy = [makeSortKey({ field: SORT_FIELD.DUE_DATE, dir: 'asc' })]
    const out = sortTasks([t1, t2, t3], sortBy, makeDoc({ tasks: [t1, t2, t3] }))
    expect(out.map(t => t.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('renderPerspective', () => {
  it('端到端产出 RenderGroup[] 且 computed 非硬编码', () => {
    const t = makeTask({
      id: 'a',
      dueDate: new Date(NOW.getTime() - 60000).toISOString(),
    })
    const doc = makeDoc({ tasks: [t] })
    const p = makePerspective()
    const groups = renderPerspective(doc, p, NOW, DUE_SOON_MS)
    expect(groups).toBeInstanceOf(Array)
    const item = groups[0]?.children[0]
    expect(item && 'computed' in item && item.computed).toBe('overdue')
  })
})

describe('applyBuiltinFilter', () => {
  it('inbox 仅顶层无 project', () => {
    const inbox = makeTask({ id: 'inbox' })
    const other = makeTask({ id: 'p', projectId: 'p1' })
    const doc = makeDoc({ tasks: [inbox, other] })
    const p = builtinPerspectives().find(x => x.id === 'inbox')!
    const out = applyBuiltinFilter([inbox, other], p, doc, NOW, DUE_SOON_MS)
    expect(out.map(t => t.id)).toEqual(['inbox'])
  })
})

describe('builtinPerspectives', () => {
  it('返回 8 个内置透视', () => {
    expect(builtinPerspectives()).toHaveLength(8)
  })
})
