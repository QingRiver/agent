import type { RenderContext } from './perspective'
import type { EntityRow, EntityRowOf } from './sync-schema'
import { describe, expect, it } from 'vitest'
import { DUE_SOON_MS, makePerspective, makeSortKey, NOW } from './__tests__/fixtures'
import { makeTaskRow, makeTaskTagRow } from './__tests__/sync-fixtures'
import { FILTER_FIELD, LEAF_OP, LOGIC_OP } from './filter'
import {
  applyBaseFilter,
  applyBuiltinFilter,
  builtinPerspectives,
  expandAncestors,
  groupBy,
  renderPerspective,
  sortTasks,
} from './perspective'
import { RowStore } from './rows'
import { buildTaskTree } from './tree'
import {
  AVAILABILITY_FILTER,
  EXPLICIT_STATUS,
  GROUP_KEY,
  SORT_FIELD,
} from './types'

function makeCtx(rows: EntityRow[]): RenderContext {
  const tasks = rows.filter((r): r is EntityRowOf<'task'> => r.entity === 'task')
  return {
    rowStore: new RowStore(rows),
    tree: buildTaskTree(tasks),
    now: NOW,
    dueSoonIntervalMs: DUE_SOON_MS,
    statusCache: new Map(),
  }
}

const availPersp = { availabilityFilter: AVAILABILITY_FILTER.AVAILABLE, showCompleted: false, showDropped: false, flaggedOnly: null }

describe('applyBaseFilter', () => {
  it('due_soon 在 available 档保留', () => {
    const t = makeTaskRow('a', { dueDate: new Date(NOW.getTime() + DUE_SOON_MS / 2).toISOString() })
    const out = applyBaseFilter([t], availPersp, makeCtx([t]))
    expect(out.map(r => r.id)).toEqual(['a'])
  })

  it('blocked 在 available 档排除', () => {
    const avail = makeTaskRow('a')
    const blocked = makeTaskRow('b', { deferDate: new Date(NOW.getTime() + 60000).toISOString() })
    const out = applyBaseFilter([avail, blocked], availPersp, makeCtx([avail, blocked]))
    expect(out.map(r => r.id)).toEqual(['a'])
  })

  it('remaining: 所有 active', () => {
    const t = makeTaskRow('a', { status: EXPLICIT_STATUS.ACTIVE })
    const out = applyBaseFilter([t], { ...availPersp, availabilityFilter: AVAILABILITY_FILTER.REMAINING }, makeCtx([t]))
    expect(out).toHaveLength(1)
  })

  it('all: 全部', () => {
    const t = makeTaskRow('a', { status: EXPLICIT_STATUS.COMPLETED })
    const out = applyBaseFilter([t], { ...availPersp, availabilityFilter: AVAILABILITY_FILTER.ALL, showCompleted: true }, makeCtx([t]))
    expect(out).toHaveLength(1)
  })
})

describe('expandAncestors', () => {
  it('补齐祖先链', () => {
    const root = makeTaskRow('r', { groupType: 'parallel' })
    const child = makeTaskRow('c', { parentId: 'r' })
    const tree = buildTaskTree([root, child])
    expect(expandAncestors(['c'], tree).sort()).toEqual(['c', 'r'])
  })
})

describe('groupBy', () => {
  it('按 project 分组', () => {
    const t1 = makeTaskRow('a', { projectId: 'p1' })
    const t2 = makeTaskRow('b', { projectId: 'p2' })
    const ctx = makeCtx([t1, t2])
    const groups = groupBy([t1, t2], [GROUP_KEY.PROJECT], ctx.rowStore, ctx)
    expect(groups).toHaveLength(2)
  })

  it('tag 多归属：一 task 进多组', () => {
    const t = makeTaskRow('a')
    const ctx = makeCtx([t, makeTaskTagRow('a', 'g1'), makeTaskTagRow('a', 'g2')])
    const groups = groupBy([t], [GROUP_KEY.TAG], ctx.rowStore, ctx)
    expect(groups).toHaveLength(2)
  })
})

describe('sortTasks', () => {
  it('dueDate 升序，null 末尾', () => {
    const t1 = makeTaskRow('a', { dueDate: null })
    const t2 = makeTaskRow('b', { dueDate: new Date('2026-07-20T00:00:00Z').toISOString() })
    const t3 = makeTaskRow('c', { dueDate: new Date('2026-07-10T00:00:00Z').toISOString() })
    const sortBy = [makeSortKey({ field: SORT_FIELD.DUE_DATE, dir: 'asc' })]
    const out = sortTasks([t1, t2, t3], sortBy, new RowStore([t1, t2, t3]))
    expect(out.map(r => r.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('renderPerspective', () => {
  it('端到端产出 RenderGroup[] 且 computed 非硬编码', () => {
    const t = makeTaskRow('a', { dueDate: new Date(NOW.getTime() - 60000).toISOString() })
    const p = makePerspective()
    const groups = renderPerspective(new RowStore([t]), p, NOW, DUE_SOON_MS)
    expect(groups).toBeInstanceOf(Array)
    const item = groups[0]?.children[0]
    expect(item && 'computed' in item && item.computed).toBe('overdue')
  })

  it('dSL 嵌套过滤：flagged AND dueDate within 命中', () => {
    const earlier = new Date(NOW.getTime() - 86400000).toISOString()
    const later = new Date(NOW.getTime() + 86400000).toISOString()
    const hit = makeTaskRow('hit', { flagged: true, dueDate: NOW.toISOString() })
    const miss = makeTaskRow('miss', { flagged: true, dueDate: null })
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
    const groups = renderPerspective(new RowStore([hit, miss]), p, NOW, DUE_SOON_MS)
    const ids = groups.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null).filter(Boolean)
    expect(ids).toEqual(['hit'])
  })
})

describe('applyBuiltinFilter', () => {
  it('inbox 仅顶层无 project', () => {
    const inbox = makeTaskRow('inbox')
    const other = makeTaskRow('p', { projectId: 'p1' })
    const p = builtinPerspectives().find(x => x.id === 'inbox')!
    const out = applyBuiltinFilter([inbox, other], p, new RowStore([inbox, other]), NOW, DUE_SOON_MS)
    expect(out.map(r => r.id)).toEqual(['inbox'])
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
