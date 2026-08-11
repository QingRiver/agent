import type { EntityRow, EntityRowOf } from '../data/sync-schema'
import type { RenderContext } from './perspective'
import { describe, expect, it } from 'vitest'
import { RowStore } from '../data/rows'
import {
  AVAILABILITY_FILTER,
  EXPLICIT_STATUS,
  GROUP_KEY,
  SORT_FIELD,
} from '../data/types'
import {
  DUE_SOON_MS,
  makePerspective,
  makeSortKey,
  makeTagRow,
  makeTaskRow,
  makeTaskTagRow,
  NOW,
} from '../fixtures'
import { buildTaskTree } from '../structure/tree'
import { FILTER_FIELD, LEAF_OP, LOGIC_OP } from './filter'
import {
  applyBaseFilter,
  applyBuiltinFilter,
  builtinPerspectives,
  expandAncestors,
  expandDescendants,
  flattenInTreeOrder,
  groupBy,
  renderPerspective,
  sortTasks,
} from './perspective'

function makeCtx(rows: EntityRow[]): RenderContext {
  const tasks = rows.filter((r): r is EntityRowOf<'task'> => r.entity === 'task')
  return {
    rowStore: new RowStore(rows),
    tree: buildTaskTree(tasks),
    now: NOW,
    dueSoonIntervalMs: DUE_SOON_MS,
    statusCache: new Map(),
    collapsibleSet: new Set(),
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

describe('expandDescendants', () => {
  it('补齐子孙', () => {
    const root = makeTaskRow('r', { groupType: 'parallel' })
    const mid = makeTaskRow('m', { parentId: 'r' })
    const leaf = makeTaskRow('l', { parentId: 'm' })
    const tree = buildTaskTree([root, mid, leaf])
    expect(expandDescendants(['r'], tree).sort()).toEqual(['l', 'm', 'r'])
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

  it('project 分组标题经 dirNameOf 解析为名称', () => {
    const t = makeTaskRow('a', { projectId: 'p1' })
    const store = new RowStore([t], { dirNameOf: id => id === 'p1' ? '项目甲' : null })
    const ctx: RenderContext = {
      rowStore: store,
      tree: buildTaskTree([t]),
      now: NOW,
      dueSoonIntervalMs: DUE_SOON_MS,
      statusCache: new Map(),
      collapsibleSet: new Set(),
    }
    const groups = groupBy([t], [GROUP_KEY.PROJECT], store, ctx)
    expect(groups).toEqual([expect.objectContaining({ key: 'p1', label: '项目甲' })])
  })

  it('tag 多归属：一 task 进多组', () => {
    const t = makeTaskRow('a')
    const ctx = makeCtx([t, makeTaskTagRow('a', 'g1'), makeTaskTagRow('a', 'g2')])
    const groups = groupBy([t], [GROUP_KEY.TAG], ctx.rowStore, ctx)
    expect(groups).toHaveLength(2)
  })

  it('dueDate 分组标题按 timeZone 格式化到分钟', () => {
    const iso = '2026-08-08T15:59:00.000Z'
    const t = makeTaskRow('a', { dueDate: iso })
    const ctx = makeCtx([t])
    ctx.timeZone = 'Asia/Shanghai'
    const groups = groupBy([t], [GROUP_KEY.DUE_DATE], ctx.rowStore, ctx)
    expect(groups).toEqual([expect.objectContaining({
      key: iso,
      label: '2026-08-08 23:59',
    })])
  })
})

describe('sortTasks', () => {
  it('dueDate 升序，null 末尾', () => {
    const t1 = makeTaskRow('a', { dueDate: null })
    const t2 = makeTaskRow('b', { dueDate: new Date('2026-07-20T00:00:00Z').toISOString() })
    const t3 = makeTaskRow('c', { dueDate: new Date('2026-07-10T00:00:00Z').toISOString() })
    const sortBy = [makeSortKey({ field: SORT_FIELD.DUE_DATE, dir: 'asc' })]
    const out = sortTasks([t1, t2, t3], sortBy, new RowStore([t1, t2, t3]), buildTaskTree([t1, t2, t3]))
    expect(out.map(r => r.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('flattenInTreeOrder', () => {
  it('父 order 大于子 order 时仍父在子前（不跨级比 order）', () => {
    const parent = makeTaskRow('fa54', {
      groupType: 'parallel',
      order: 1,
      dueDate: new Date(NOW.getTime() + DUE_SOON_MS / 2).toISOString(),
    })
    const child = makeTaskRow('d844', { parentId: 'fa54', order: 0 })
    const sortBy = [makeSortKey({ field: SORT_FIELD.ORDER, dir: 'asc' })]
    const store = new RowStore([parent, child])
    const tree = buildTaskTree([parent, child])
    const out = flattenInTreeOrder(tree, [parent, child], sortBy, store)
    expect(out.map(r => r.id)).toEqual(['fa54', 'd844'])
  })

  it('仅命中子任务时 expand 后的祖先仍排在子前', () => {
    const parent = makeTaskRow('p', { groupType: 'parallel', order: 5 })
    const child = makeTaskRow('c', { parentId: 'p', order: 0 })
    const sortBy = [makeSortKey({ field: SORT_FIELD.ORDER, dir: 'asc' })]
    const store = new RowStore([parent, child])
    const tree = buildTaskTree([parent, child])
    const out = flattenInTreeOrder(tree, [parent, child], sortBy, store)
    expect(out.map(r => r.id)).toEqual(['p', 'c'])
  })
})

describe('renderPerspective', () => {
  it('按 order 排序时不把子任务排到父前面', () => {
    const parent = makeTaskRow('fa54', {
      groupType: 'parallel',
      order: 1,
      dueDate: new Date(NOW.getTime() + DUE_SOON_MS / 2).toISOString(),
    })
    const child = makeTaskRow('d844', { parentId: 'fa54', order: 0 })
    const p = makePerspective({
      sortBy: [makeSortKey({ field: SORT_FIELD.ORDER, dir: 'asc' })],
      availabilityFilter: AVAILABILITY_FILTER.REMAINING,
    })
    const groups = renderPerspective(new RowStore([parent, child]), p, NOW, DUE_SOON_MS, 'UTC')
    const ids = groups.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null)
    expect(ids).toEqual(['fa54', 'd844'])
    expect(groups.flatMap(g => g.children).map(c => 'depth' in c ? c.depth : null)).toEqual([0, 1])
  })

  it('点具体标签：命中父任务时带上未打标子任务，且标签透视不收纯未打标任务', () => {
    const tag = makeTagRow('tag-aaa', { name: 'aaa' })
    const parent = makeTaskRow('fa54', {
      name: 'aaa',
      groupType: 'sequential',
      order: 0,
      dueDate: new Date(NOW.getTime() + DUE_SOON_MS / 2).toISOString(),
    })
    const child = makeTaskRow('d844', { name: '4', parentId: 'fa54', order: 3 })
    const orphan = makeTaskRow('lonely')
    const store = new RowStore([parent, child, orphan, tag, makeTaskTagRow('fa54', 'tag-aaa')])

    const tagsPersp = builtinPerspectives().find(x => x.id === 'tags')!
    const tagsGroups = renderPerspective(store, tagsPersp, NOW, DUE_SOON_MS, 'UTC')
    expect(tagsGroups.map(g => g.label)).toEqual(['aaa'])
    expect(tagsGroups[0]?.children.map(c => 'taskId' in c ? c.taskId : null)).toEqual(['fa54', 'd844'])

    const tagSel = makePerspective({
      filter: { op: LEAF_OP.SOME, field: FILTER_FIELD.TAG, value: ['tag-aaa'] },
      sortBy: [makeSortKey({ field: SORT_FIELD.ORDER, dir: 'asc' })],
      availabilityFilter: AVAILABILITY_FILTER.REMAINING,
    })
    const tagGroups = renderPerspective(store, tagSel, NOW, DUE_SOON_MS, 'UTC')
    const ids = tagGroups.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null)
    expect(ids).toEqual(['fa54', 'd844'])
  })

  it('端到端产出 RenderGroup[] 且 computed 非硬编码', () => {
    const t = makeTaskRow('a', { dueDate: new Date(NOW.getTime() - 60000).toISOString() })
    const p = makePerspective()
    const groups = renderPerspective(new RowStore([t]), p, NOW, DUE_SOON_MS, 'UTC')
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
    const groups = renderPerspective(new RowStore([hit, miss]), p, NOW, DUE_SOON_MS, 'UTC')
    const ids = groups.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null).filter(Boolean)
    expect(ids).toEqual(['hit'])
  })

  it('forecast 默认仅今日：rolling 入今日块', () => {
    const t = makeTaskRow('r', { plannedMode: 'rolling', plannedDate: null })
    const forecast = builtinPerspectives().find(x => x.id === 'forecast')!
    const groups = renderPerspective(new RowStore([t]), forecast, NOW, DUE_SOON_MS, 'UTC')
    expect(groups.map(g => g.key)).toEqual(['today'])
    expect(groups[0]?.children).toHaveLength(1)
  })

  it('forecast 经 applyBaseFilter：completed 不进视图', () => {
    const active = makeTaskRow('a', { plannedMode: 'rolling', plannedDate: null })
    const done = makeTaskRow('d', {
      plannedMode: 'rolling',
      plannedDate: null,
      status: EXPLICIT_STATUS.COMPLETED,
      completedAt: NOW.toISOString(),
    })
    const forecast = builtinPerspectives().find(x => x.id === 'forecast')!
    const groups = renderPerspective(new RowStore([active, done]), forecast, NOW, DUE_SOON_MS, 'UTC')
    const ids = groups.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null)
    expect(ids).toEqual(['a'])
  })
})

describe('applyBuiltinFilter', () => {
  it('inbox 仅 mountDirId 为 null 的顶层', () => {
    const inbox = makeTaskRow('inbox')
    const other = makeTaskRow('p', { mountDirId: 'p1' })
    const p = builtinPerspectives().find(x => x.id === 'inbox')!
    const out = applyBuiltinFilter([inbox, other], p)
    expect(out.map(r => r.id)).toEqual(['inbox'])
  })
})

describe('builtinPerspectives', () => {
  it('返回 6 个内置透视', () => {
    expect(builtinPerspectives()).toHaveLength(6)
  })

  it('forecast 居首且无 predicted', () => {
    expect(builtinPerspectives()[0]?.id).toBe('forecast')
    expect(builtinPerspectives().find(x => x.id === 'predicted')).toBeUndefined()
  })

  it('forecast 声明：REMAINING + 空 groupBy/sortBy（日块非通用管线）', () => {
    const forecast = builtinPerspectives().find(x => x.id === 'forecast')!
    expect(forecast.availabilityFilter).toBe(AVAILABILITY_FILTER.REMAINING)
    expect(forecast.groupBy).toEqual([])
    expect(forecast.sortBy).toEqual([])
  })

  it('flagged 内置透视使用 DSL is 节点', () => {
    const flagged = builtinPerspectives().find(x => x.id === 'flagged')!
    expect(flagged.filter).toEqual({ op: LEAF_OP.IS, field: FILTER_FIELD.FLAGGED, value: true })
  })

  it('inbox 内置透视使用 DSL empty 节点', () => {
    const inbox = builtinPerspectives().find(x => x.id === 'inbox')!
    expect(inbox.filter).toEqual({ op: LEAF_OP.EMPTY, field: FILTER_FIELD.PROJECT })
  })

  it('tags 内置透视排除未打标', () => {
    const tags = builtinPerspectives().find(x => x.id === 'tags')!
    expect(tags.filter).toEqual({
      op: LOGIC_OP.NOT,
      child: { op: LEAF_OP.EMPTY, field: FILTER_FIELD.TAG },
    })
    expect(tags.groupBy).toEqual([GROUP_KEY.TAG])
  })
})

// SP-COLLAPSE: 渲染层塌陷——纯结构中间层（非 matched 且子树含 matched 后代）不占行，
// 孙任务透传挂最近可见祖先下、与该祖先的其他可见子同级缩进、同级 sortBy 排序。
// B 非 matched 用 flaggedOnly + flagged:false（applyBaseFilter 排除），不能用 HOLD/deferDate——
// availability.computeStatus 上溯祖先：终态(HOLD/COMPLETED)或 effectiveDefer 未来都会 block 后代 C。
// flagged 不影响 computeStatus，B status=ACTIVE 不 block C。
describe('渲染层塌陷 [SP-COLLAPSE]', () => {
  const dueSoon = new Date(NOW.getTime() + DUE_SOON_MS / 2).toISOString()

  it('纯结构中间层 B 不占行，C 透传挂 A 下与 D 同级 [SP-COLLAPSE-1/2]', () => {
    const a = makeTaskRow('a', { groupType: 'parallel', order: 0, dueDate: dueSoon, flagged: true })
    const b = makeTaskRow('b', { parentId: 'a', order: 0, status: EXPLICIT_STATUS.ACTIVE, flagged: false })
    const c = makeTaskRow('c', { parentId: 'b', order: 0, dueDate: dueSoon, flagged: true })
    const d = makeTaskRow('d', { parentId: 'a', order: 5, dueDate: dueSoon, flagged: true })
    const p = makePerspective({
      sortBy: [makeSortKey({ field: SORT_FIELD.ORDER, dir: 'asc' })],
      availabilityFilter: AVAILABILITY_FILTER.AVAILABLE,
      flaggedOnly: true,
    })
    const groups = renderPerspective(new RowStore([a, b, c, d]), p, NOW, DUE_SOON_MS, 'UTC')
    const ids = groups.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null)
    const depths = groups.flatMap(g => g.children).map(c => 'depth' in c ? c.depth : null)
    expect(ids).toEqual(['a', 'c', 'd'])
    expect(depths).toEqual([0, 1, 1])
  })

  it('塌陷后 C 与 D 同组 sortBy 排序（非固定树序） [SP-COLLAPSE-3]', () => {
    const a = makeTaskRow('a', { groupType: 'parallel', order: 0, dueDate: dueSoon, flagged: true })
    const b = makeTaskRow('b', { parentId: 'a', order: 0, status: EXPLICIT_STATUS.ACTIVE, flagged: false })
    const c = makeTaskRow('c', { parentId: 'b', order: 5, dueDate: dueSoon, flagged: true })
    const d = makeTaskRow('d', { parentId: 'a', order: 0, dueDate: dueSoon, flagged: true })
    const p = makePerspective({
      sortBy: [makeSortKey({ field: SORT_FIELD.ORDER, dir: 'asc' })],
      availabilityFilter: AVAILABILITY_FILTER.AVAILABLE,
      flaggedOnly: true,
    })
    const groups = renderPerspective(new RowStore([a, b, c, d]), p, NOW, DUE_SOON_MS, 'UTC')
    const ids = groups.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null)
    // D.order=0 < C.order=5 → D 先于 C（若按真实树序 C 在 B 下应先，塌陷后同组 sortBy 才能换序）
    expect(ids).toEqual(['a', 'd', 'c'])
  })

  it('链式塌陷：B/X 均纯结构祖先，C 透传挂 A 下 depth=1 [SP-COLLAPSE-1/2]', () => {
    const a = makeTaskRow('a', { groupType: 'parallel', order: 0, dueDate: dueSoon, flagged: true })
    const b = makeTaskRow('b', { parentId: 'a', order: 0, status: EXPLICIT_STATUS.ACTIVE, flagged: false })
    const x = makeTaskRow('x', { parentId: 'b', order: 0, status: EXPLICIT_STATUS.ACTIVE, flagged: false })
    const c = makeTaskRow('c', { parentId: 'x', order: 0, dueDate: dueSoon, flagged: true })
    const p = makePerspective({
      sortBy: [makeSortKey({ field: SORT_FIELD.ORDER, dir: 'asc' })],
      availabilityFilter: AVAILABILITY_FILTER.AVAILABLE,
      flaggedOnly: true,
    })
    const groups = renderPerspective(new RowStore([a, b, x, c]), p, NOW, DUE_SOON_MS, 'UTC')
    const ids = groups.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null)
    const depths = groups.flatMap(g => g.children).map(c => 'depth' in c ? c.depth : null)
    expect(ids).toEqual(['a', 'c'])
    expect(depths).toEqual([0, 1])
  })

  it('flattenInTreeOrder 直调：collapsibleSet 塌陷 B，C 与 D 同级 [SP-COLLAPSE-3]', () => {
    const a = makeTaskRow('a', { groupType: 'parallel', order: 0 })
    const b = makeTaskRow('b', { parentId: 'a', order: 0 })
    const c = makeTaskRow('c', { parentId: 'b', order: 0 })
    const d = makeTaskRow('d', { parentId: 'a', order: 5 })
    const store = new RowStore([a, b, c, d])
    const tree = buildTaskTree([a, b, c, d])
    const sortBy = [makeSortKey({ field: SORT_FIELD.ORDER, dir: 'asc' })]
    // visible 排除 B（塌陷），C/D 可见
    const out = flattenInTreeOrder(tree, [a, c, d], sortBy, store, new Set(['b']))
    expect(out.map(r => r.id)).toEqual(['a', 'c', 'd'])
  })

  it('flattenInTreeOrder 直调：空集 collapsibleSet 行为不变（向后兼容）', () => {
    const a = makeTaskRow('a', { groupType: 'parallel', order: 0 })
    const b = makeTaskRow('b', { parentId: 'a', order: 0 })
    const store = new RowStore([a, b])
    const tree = buildTaskTree([a, b])
    const sortBy = [makeSortKey({ field: SORT_FIELD.ORDER, dir: 'asc' })]
    const out = flattenInTreeOrder(tree, [a, b], sortBy, store)
    expect(out.map(r => r.id)).toEqual(['a', 'b'])
  })
})
