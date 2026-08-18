import type { EntityRow, EntityRowOf } from '../data/sync-schema'
import type { RenderContext } from './perspective'
import { describe, expect, it } from 'vitest'
import { RowStore } from '../data/rows'
import {
  AVAILABILITY_FILTER,
  BUILTIN_PERSPECTIVE_ID,
  COMPUTED_STATUS,
  EXPLICIT_STATUS,
  GROUP_KEY,
  SORT_FIELD,
} from '../data/types'
import {
  DUE_SOON_MS,
  makePerspective,
  makeSortKey,
  makeTaskRow,
  makeTaskTagRow,
  NOW,
} from '../fixtures'
import { buildTaskTree } from '../structure/tree'
import { FILTER_FIELD, LEAF_OP, LOGIC_OP } from './filter'
import {
  applyBaseFilter,
  builtinPerspectives,
  expandAncestors,
  expandDescendants,
  flattenInTreeOrder,
  groupBy,
  isInboxFilter,
  matchesAvailability,
  renderPerspective,
  sortTasks,
} from './perspective'

function makeCtx(
  rows: EntityRow[],
  catalog?: { projectOf?: (t: EntityRowOf<'task'>) => string | null, dirNameOf?: (id: string) => string | null, tagNameOf?: (id: string) => string | null },
): RenderContext {
  const tasks = rows.filter((r): r is EntityRowOf<'task'> => r.entity === 'task')
  return {
    rowStore: new RowStore(rows),
    tree: buildTaskTree(tasks),
    now: NOW,
    dueSoonIntervalMs: DUE_SOON_MS,
    statusCache: new Map(),
    collapsibleSet: new Set(),
    ...catalog,
  }
}

const AVAIL_FILTER = AVAILABILITY_FILTER.AVAILABLE

describe('matchesAvailability', () => {
  it('all 含终态', () => {
    const t = makeTaskRow('x', { status: EXPLICIT_STATUS.COMPLETED })
    expect(matchesAvailability(t, AVAILABILITY_FILTER.ALL, COMPUTED_STATUS.BLOCKED, buildTaskTree([t]))).toBe(true)
  })

  it('remaining 仅 active', () => {
    const active = makeTaskRow('a')
    const hold = makeTaskRow('h', { status: EXPLICIT_STATUS.HOLD })
    expect(matchesAvailability(active, AVAILABILITY_FILTER.REMAINING, COMPUTED_STATUS.AVAILABLE, buildTaskTree([active]))).toBe(true)
    expect(matchesAvailability(hold, AVAILABILITY_FILTER.REMAINING, COMPUTED_STATUS.BLOCKED, buildTaskTree([hold]))).toBe(false)
  })

  it('available 需 actionable', () => {
    const t = makeTaskRow('a')
    expect(matchesAvailability(t, AVAILABILITY_FILTER.AVAILABLE, COMPUTED_STATUS.AVAILABLE, buildTaskTree([t]))).toBe(true)
    expect(matchesAvailability(t, AVAILABILITY_FILTER.AVAILABLE, COMPUTED_STATUS.BLOCKED, buildTaskTree([t]))).toBe(false)
  })
})

describe('applyBaseFilter', () => {
  it('due_soon 在 available 档保留', () => {
    const t = makeTaskRow('a', { dueDate: new Date(NOW.getTime() + DUE_SOON_MS / 2).toISOString() })
    const out = applyBaseFilter([t], AVAIL_FILTER, makeCtx([t]))
    expect(out.map(r => r.id)).toEqual(['a'])
  })

  it('blocked 在 available 档排除', () => {
    const avail = makeTaskRow('a')
    const blocked = makeTaskRow('b', { deferDate: new Date(NOW.getTime() + 60000).toISOString() })
    const out = applyBaseFilter([avail, blocked], AVAIL_FILTER, makeCtx([avail, blocked]))
    expect(out.map(r => r.id)).toEqual(['a'])
  })

  it('remaining: 所有 active', () => {
    const t = makeTaskRow('a', { status: EXPLICIT_STATUS.ACTIVE })
    const out = applyBaseFilter([t], AVAILABILITY_FILTER.REMAINING, makeCtx([t]))
    expect(out).toHaveLength(1)
  })

  it('remaining 不含 HOLD；all 含（OF Everything）', () => {
    const active = makeTaskRow('a')
    const hold = makeTaskRow('h', {
      status: EXPLICIT_STATUS.HOLD,
      heldAt: NOW.toISOString(),
    })
    const remaining = applyBaseFilter(
      [active, hold],
      AVAILABILITY_FILTER.REMAINING,
      makeCtx([active, hold]),
    )
    expect(remaining.map(r => r.id)).toEqual(['a'])
    const all = applyBaseFilter(
      [active, hold],
      AVAILABILITY_FILTER.ALL,
      makeCtx([active, hold]),
    )
    expect(all.map(r => r.id).sort()).toEqual(['a', 'h'])
  })

  it('all: 全部', () => {
    const t = makeTaskRow('a', { status: EXPLICIT_STATUS.COMPLETED })
    const out = applyBaseFilter([t], AVAILABILITY_FILTER.ALL, makeCtx([t]))
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
    const t1 = makeTaskRow('a', { mountDirId: 'p1' })
    const t2 = makeTaskRow('b', { mountDirId: 'p2' })
    const ctx = makeCtx([t1, t2], {
      projectOf: t => t.data.mountDirId,
    })
    const groups = groupBy([t1, t2], [GROUP_KEY.PROJECT], ctx)
    expect(groups).toHaveLength(2)
  })

  it('project 分组标题经 dirNameOf 解析为名称', () => {
    const t = makeTaskRow('a', { mountDirId: 'p1' })
    const ctx = makeCtx([t], {
      projectOf: () => 'p1',
      dirNameOf: id => id === 'p1' ? '项目甲' : null,
    })
    const groups = groupBy([t], [GROUP_KEY.PROJECT], ctx)
    expect(groups).toEqual([expect.objectContaining({ key: 'p1', label: '项目甲' })])
  })

  it('tag 分组标题经 tagNameOf 解析为名称', () => {
    const t = makeTaskRow('a')
    const ctx = makeCtx([t, makeTaskTagRow('a', 'g1')], {
      tagNameOf: id => id === 'g1' ? '情境·电话' : null,
    })
    const groups = groupBy([t], [GROUP_KEY.TAG], ctx)
    expect(groups).toEqual([expect.objectContaining({ key: 'g1', label: '情境·电话' })])
  })

  it('tag 多归属：一 task 进多组', () => {
    const t = makeTaskRow('a')
    const ctx = makeCtx([t, makeTaskTagRow('a', 'g1'), makeTaskTagRow('a', 'g2')])
    const groups = groupBy([t], [GROUP_KEY.TAG], ctx)
    expect(groups).toHaveLength(2)
  })

  it('dueDate 分组标题按 timeZone 格式化到分钟', () => {
    const iso = '2026-08-08T15:59:00.000Z'
    const t = makeTaskRow('a', { dueDate: iso })
    const ctx = makeCtx([t])
    ctx.timeZone = 'Asia/Shanghai'
    const groups = groupBy([t], [GROUP_KEY.DUE_DATE], ctx)
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
    })
    const groups = renderPerspective(new RowStore([parent, child]), p, NOW, DUE_SOON_MS, 'UTC')
    const ids = groups.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null)
    expect(ids).toEqual(['fa54', 'd844'])
    expect(groups.flatMap(g => g.children).map(c => 'depth' in c ? c.depth : null)).toEqual([0, 1])
  })

  it('点具体标签：入组已复制 task_tag 的子命中；纯未打标任务不进标签透视', () => {
    const parent = makeTaskRow('fa54', {
      name: 'aaa',
      groupType: 'sequential',
      order: 0,
      dueDate: new Date(NOW.getTime() + DUE_SOON_MS / 2).toISOString(),
    })
    const child = makeTaskRow('d844', { name: '4', parentId: 'fa54', order: 3 })
    const orphan = makeTaskRow('lonely')
    // 子任务带物理 task_tag（模拟 OF 入组复制后的状态）；未复制的 orphan 不进透视
    // 标签目录不在 RowStore；分组标题经 tagNameOf 注入（对齐 TagsStore）
    const store = new RowStore([
      parent,
      child,
      orphan,
      makeTaskTagRow('fa54', 'tag-aaa'),
      makeTaskTagRow('d844', 'tag-aaa'),
    ])
    const catalog = { tagNameOf: (id: string) => id === 'tag-aaa' ? 'aaa' : null }

    const tagsPersp = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.TAGS)!
    const tagsGroups = renderPerspective(store, tagsPersp, NOW, DUE_SOON_MS, 'UTC', catalog)
    expect(tagsGroups.map(g => g.label)).toEqual(['aaa'])
    expect(tagsGroups[0]?.children.map(c => 'taskId' in c ? c.taskId : null)).toEqual(['fa54', 'd844'])

    const tagSel = makePerspective({
      filter: { op: LEAF_OP.SOME, field: FILTER_FIELD.TAG, value: ['tag-aaa'] },
      sortBy: [makeSortKey({ field: SORT_FIELD.ORDER, dir: 'asc' })],
    })
    const tagGroups = renderPerspective(store, tagSel, NOW, DUE_SOON_MS, 'UTC', catalog)
    const ids = tagGroups.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null)
    expect(ids).toEqual(['fa54', 'd844'])
  })

  it('标签+全部/未完成：串行后序 blocked 有物理标可见；仅可执行仍藏', () => {
    const parent = makeTaskRow('p', {
      name: '组',
      groupType: 'sequential',
      dueDate: new Date(NOW.getTime() + DUE_SOON_MS / 2).toISOString(),
    })
    const first = makeTaskRow('c1', { name: '1', parentId: 'p', order: 0 })
    const second = makeTaskRow('c2', { name: '2', parentId: 'p', order: 1 })
    const store = new RowStore([
      parent,
      first,
      second,
      makeTaskTagRow('p', 'tag-aaa'),
      makeTaskTagRow('c1', 'tag-aaa'),
      makeTaskTagRow('c2', 'tag-aaa'),
    ])
    const filter = { op: LEAF_OP.SOME, field: FILTER_FIELD.TAG, value: ['tag-aaa'] }
    const sortBy = [makeSortKey({ field: SORT_FIELD.ORDER, dir: 'asc' })]

    const available = renderPerspective(store, makePerspective({ filter, sortBy }), NOW, DUE_SOON_MS, 'UTC', {
      availabilityFilter: AVAILABILITY_FILTER.AVAILABLE,
    })
    expect(available.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null))
      .toEqual(['p', 'c1'])
    const remaining = renderPerspective(store, makePerspective({ filter, sortBy }), NOW, DUE_SOON_MS, 'UTC', {
      availabilityFilter: AVAILABILITY_FILTER.REMAINING,
    })
    expect(remaining.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null))
      .toEqual(['p', 'c1', 'c2'])

    const all = renderPerspective(store, makePerspective({ filter, sortBy }), NOW, DUE_SOON_MS, 'UTC', {
      availabilityFilter: AVAILABILITY_FILTER.ALL,
    })
    expect(all.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null))
      .toEqual(['p', 'c1', 'c2'])
  })

  it('available：串行后序 blocked 不因父命中而出现', () => {
    const parent = makeTaskRow('p', {
      name: '组',
      groupType: 'sequential',
      dueDate: new Date(NOW.getTime() + DUE_SOON_MS / 2).toISOString(),
    })
    const first = makeTaskRow('c1', { name: '1', parentId: 'p', order: 0 })
    const second = makeTaskRow('c2', { name: '2', parentId: 'p', order: 1 })
    const p = makePerspective({
      sortBy: [makeSortKey({ field: SORT_FIELD.ORDER, dir: 'asc' })],
    })
    const groups = renderPerspective(new RowStore([parent, first, second]), p, NOW, DUE_SOON_MS, 'UTC', {
      availabilityFilter: AVAILABILITY_FILTER.AVAILABLE,
    })
    const ids = groups.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null)
    expect(ids).toEqual(['p', 'c1'])
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
      filter: {
        op: LOGIC_OP.AND,
        children: [
          { op: LEAF_OP.IS, field: FILTER_FIELD.FLAGGED, value: true },
          { op: LEAF_OP.WITHIN, field: FILTER_FIELD.DUE_DATE, value: [earlier, later] },
        ],
      },
    })
    const groups = renderPerspective(new RowStore([hit, miss]), p, NOW, DUE_SOON_MS, 'UTC', {
      availabilityFilter: AVAILABILITY_FILTER.ALL,
    })
    const ids = groups.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null).filter(Boolean)
    expect(ids).toEqual(['hit'])
  })

  it('forecast 默认仅现在：rolling 入现在块', () => {
    const t = makeTaskRow('r', { plannedMode: 'rolling', plannedDate: null })
    const forecast = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.FORECAST)!
    const groups = renderPerspective(new RowStore([t]), forecast, NOW, DUE_SOON_MS, 'UTC')
    expect(groups.map(g => g.key)).toEqual(['now'])
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
    const forecast = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.FORECAST)!
    const groups = renderPerspective(new RowStore([active, done]), forecast, NOW, DUE_SOON_MS, 'UTC')
    const ids = groups.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null)
    expect(ids).toEqual(['a'])
  })
})

describe('inbox 透视', () => {
  it('project empty：含 Inbox 内子动作（OF 语义）', () => {
    const parent = makeTaskRow('inbox-parent', { mountDirId: null })
    const child = makeTaskRow('inbox-child', { parentId: 'inbox-parent', mountDirId: null })
    const inProject = makeTaskRow('in-proj', { mountDirId: 'p1' })
    const inbox = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.INBOX)!
    const store = new RowStore([parent, child, inProject])
    const groups = renderPerspective(store, inbox, NOW, DUE_SOON_MS, 'UTC', {
      projectOf: t => t.data.mountDirId,
    })
    const ids = groups.flatMap(g => g.children).map(c => 'taskId' in c ? c.taskId : null)
    expect(ids).toEqual(['inbox-parent', 'inbox-child'])
  })

  // 第 4 点：读侧切 effectiveStatus——删父/搁置父的子靠有效状态跟随父进对应透视，不再留在 Remaining
  const collectIds = (groups: Array<{ children: unknown[] }>): string[] =>
    groups.flatMap(g => g.children).flatMap(c => 'taskId' in (c as object) ? [(c as { taskId: string }).taskId] : [])

  it('删父后子靠有效状态跟随父进 Trash 透视（物理仍活跃）', () => {
    const parent = makeTaskRow('trash-parent', { status: EXPLICIT_STATUS.DELETED })
    const child = makeTaskRow('trash-child', { parentId: 'trash-parent' }) // 物理 ACTIVE
    const trash = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.TRASH)!
    const store = new RowStore([parent, child])
    const groups = renderPerspective(store, trash, NOW, DUE_SOON_MS, 'UTC', {
      availabilityFilter: AVAILABILITY_FILTER.ALL,
    })
    expect(collectIds(groups).sort()).toEqual(['trash-child', 'trash-parent'])
  })

  it('搁置父后子靠有效状态跟随父进 Hold 透视（物理仍活跃）', () => {
    const parent = makeTaskRow('hold-parent', { status: EXPLICIT_STATUS.HOLD })
    const child = makeTaskRow('hold-child', { parentId: 'hold-parent' }) // 物理 ACTIVE
    const hold = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.HOLD)!
    const store = new RowStore([parent, child])
    const groups = renderPerspective(store, hold, NOW, DUE_SOON_MS, 'UTC', {
      availabilityFilter: AVAILABILITY_FILTER.ALL,
    })
    expect(collectIds(groups).sort()).toEqual(['hold-child', 'hold-parent'])
  })

  it('删父后子不留在 Remaining（effective deleted ≠ active）', () => {
    const parent = makeTaskRow('rem-parent', { status: EXPLICIT_STATUS.DELETED })
    const child = makeTaskRow('rem-child', { parentId: 'rem-parent' }) // 物理 ACTIVE 但有效 deleted
    const p = makePerspective({ filter: null, sortBy: [makeSortKey({ field: SORT_FIELD.ORDER, dir: 'asc' })] })
    const store = new RowStore([parent, child])
    const groups = renderPerspective(store, p, NOW, DUE_SOON_MS, 'UTC', {
      availabilityFilter: AVAILABILITY_FILTER.REMAINING,
    })
    // parent 物理 deleted 不进 remaining；child 有效 deleted 也不进
    expect(collectIds(groups)).toEqual([])
  })

  it('完成父后子靠有效状态跟随父进 Completed 透视（物理仍活跃）', () => {
    const parent = makeTaskRow('done-parent', { status: EXPLICIT_STATUS.COMPLETED })
    const child = makeTaskRow('done-child', { parentId: 'done-parent' }) // 物理 ACTIVE
    const completed = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.COMPLETED)!
    const store = new RowStore([parent, child])
    const groups = renderPerspective(store, completed, NOW, DUE_SOON_MS, 'UTC', {
      availabilityFilter: AVAILABILITY_FILTER.ALL,
    })
    expect(collectIds(groups).sort()).toEqual(['done-child', 'done-parent'])
  })
})

describe('builtinPerspectives', () => {
  it('返回 9 个内置透视', () => {
    expect(builtinPerspectives()).toHaveLength(9)
  })

  it('forecast 居首且无 predicted', () => {
    expect(builtinPerspectives()[0]?.id).toBe(BUILTIN_PERSPECTIVE_ID.FORECAST)
    expect(builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.PROJECTS)).toBeDefined()
    expect(builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.TAGS)).toBeDefined()
    expect(builtinPerspectives().find(x => x.id === 'predicted')).toBeUndefined()
  })

  it('forecast 空 groupBy/sortBy（日块非通用管线）', () => {
    const forecast = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.FORECAST)!
    expect(forecast.groupBy).toEqual([])
    expect(forecast.sortBy).toEqual([])
  })

  it('flagged 内置透视使用 DSL is 节点', () => {
    const flagged = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.FLAGGED)!
    expect(flagged.filter).toEqual({ op: LEAF_OP.IS, field: FILTER_FIELD.FLAGGED, value: true })
  })

  it('inbox 内置透视使用 DSL empty 节点', () => {
    const inbox = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.INBOX)!
    expect(inbox.filter).toEqual({ op: LEAF_OP.EMPTY, field: FILTER_FIELD.PROJECT })
    expect(isInboxFilter(inbox.filter)).toBe(true)
    expect(isInboxFilter(null)).toBe(false)
    expect(isInboxFilter({ op: LEAF_OP.EMPTY, field: FILTER_FIELD.TAG })).toBe(false)
  })

  it('projects 内置透视排除无项目', () => {
    const projects = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.PROJECTS)!
    expect(projects.filter).toEqual({
      op: LOGIC_OP.NOT,
      child: { op: LEAF_OP.EMPTY, field: FILTER_FIELD.PROJECT },
    })
    expect(projects.groupBy).toEqual([GROUP_KEY.PROJECT])
  })

  it('tags 内置透视排除未打标', () => {
    const tags = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.TAGS)!
    expect(tags.filter).toEqual({
      op: LOGIC_OP.NOT,
      child: { op: LEAF_OP.EMPTY, field: FILTER_FIELD.TAG },
    })
    expect(tags.groupBy).toEqual([GROUP_KEY.TAG])
  })

  it('completed 内置透视用 status=completed DSL', () => {
    const completed = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.COMPLETED)!
    expect(completed.filter).toEqual({
      op: LEAF_OP.IS,
      field: FILTER_FIELD.STATUS,
      value: EXPLICIT_STATUS.COMPLETED,
    })
  })

  it('hold 内置透视用 status=hold DSL', () => {
    const hold = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.HOLD)!
    expect(hold.filter).toEqual({
      op: LEAF_OP.IS,
      field: FILTER_FIELD.STATUS,
      value: EXPLICIT_STATUS.HOLD,
    })
  })

  it('trash 内置透视用 status=deleted DSL', () => {
    const trash = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.TRASH)!
    expect(trash.filter).toEqual({
      op: LEAF_OP.IS,
      field: FILTER_FIELD.STATUS,
      value: EXPLICIT_STATUS.DELETED,
    })
  })

  it('all 内置透视无 DSL 过滤', () => {
    const all = builtinPerspectives().find(x => x.id === BUILTIN_PERSPECTIVE_ID.ALL)!
    expect(all.filter).toBeNull()
  })
})

// SP-COLLAPSE: 渲染层塌陷——纯结构中间层（非 matched 且子树含 matched 后代）不占行，
// 孙任务透传挂最近可见祖先下、与该祖先的其他可见子同级缩进、同级 sortBy 排序。
// B 非 matched 用 filter flagged:false（matchFilter 排除），不能用 HOLD/deferDate——
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
      filter: { op: LEAF_OP.IS, field: FILTER_FIELD.FLAGGED, value: true },
    })
    const groups = renderPerspective(new RowStore([a, b, c, d]), p, NOW, DUE_SOON_MS, 'UTC', {
      availabilityFilter: AVAILABILITY_FILTER.AVAILABLE,
    })
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
      filter: { op: LEAF_OP.IS, field: FILTER_FIELD.FLAGGED, value: true },
    })
    const groups = renderPerspective(new RowStore([a, b, c, d]), p, NOW, DUE_SOON_MS, 'UTC', {
      availabilityFilter: AVAILABILITY_FILTER.AVAILABLE,
    })
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
      filter: { op: LEAF_OP.IS, field: FILTER_FIELD.FLAGGED, value: true },
    })
    const groups = renderPerspective(new RowStore([a, b, x, c]), p, NOW, DUE_SOON_MS, 'UTC', {
      availabilityFilter: AVAILABILITY_FILTER.AVAILABLE,
    })
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
