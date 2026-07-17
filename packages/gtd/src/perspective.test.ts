import { describe, expect, it } from 'vitest'
import {
  DUE_SOON_MS,
  makeDoc,
  makePerspective,
  makeSortKey,
  makeTask,
  NOW,
} from './__tests__/fixtures'
import { FILTER_FIELD, LEAF_OP, LOGIC_OP } from './filter'
import {
  applyAvailabilityFilter,
  applyBuiltinFilter,
  builtinPerspectives,
  expandAncestors,
  groupBy,
  renderPerspective,
  sortTasks,
} from './perspective'
import { buildTaskTree } from './tree'
import {
  AVAILABILITY_FILTER,
  EXPLICIT_STATUS,
  GROUP_KEY,
  SORT_FIELD,
} from './types'

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
    const out = applyAvailabilityFilter([t], AVAILABILITY_FILTER.REMAINING, tree, NOW, DUE_SOON_MS)
    expect(out).toHaveLength(1)
  })

  it('all: 全部', () => {
    const t = makeTask({ id: 'a', status: EXPLICIT_STATUS.COMPLETED })
    const tree = buildTaskTree([t])
    const out = applyAvailabilityFilter([t], AVAILABILITY_FILTER.ALL, tree, NOW, DUE_SOON_MS)
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

  it('dSL 嵌套过滤：flagged AND dueDate within 命中', () => {
    const earlier = new Date(NOW.getTime() - 86400000).toISOString()
    const later = new Date(NOW.getTime() + 86400000).toISOString()
    const hit = makeTask({ id: 'hit', flagged: true, dueDate: NOW.toISOString() })
    const miss = makeTask({ id: 'miss', flagged: true, dueDate: null })
    const doc = makeDoc({ tasks: [hit, miss] })
    const p = makePerspective({
      availabilityFilter: AVAILABILITY_FILTER.ALL,
      showCompleted: true,
      showDropped: true,
      filter: {
        op: LOGIC_OP.AND,
        children: [
          { op: LEAF_OP.IS, field: FILTER_FIELD.FLAGGED, value: true },
          { op: LEAF_OP.WITHIN, field: FILTER_FIELD.DUE_DATE, value: [earlier, later] },
        ],
      },
    })
    const groups = renderPerspective(doc, p, NOW, DUE_SOON_MS)
    const ids = groups.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null).filter(Boolean)
    expect(ids).toEqual(['hit'])
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

  it('flagged 内置透视使用 DSL is 节点', () => {
    const flagged = builtinPerspectives().find(x => x.id === 'flagged')!
    expect(flagged.filter).toEqual({ op: LEAF_OP.IS, field: FILTER_FIELD.FLAGGED, value: true })
  })

  it('inbox 内置透视使用 DSL empty 节点', () => {
    const inbox = builtinPerspectives().find(x => x.id === 'inbox')!
    expect(inbox.filter).toEqual({ op: LEAF_OP.EMPTY, field: FILTER_FIELD.PROJECT })
  })
})
