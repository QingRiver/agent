import type { EntityRow, EntityRowOf, GtdCommand } from '../data/sync-schema'
import type { TaskTree } from '../structure/tree'

import { describe, expect, it } from 'vitest'
import { EXPLICIT_STATUS } from '../data/types'
import {
  field,
  findRow,
  makeCommand,
  makeState,
  makeTaskRow,
  SYNC_NOW,
} from '../fixtures'
import { effectiveStatus } from '../inheritance/effective'
import { ancestors, buildTaskTree } from '../structure/tree'
import { applyPush } from '../sync'

/**
 * 到达序测试：固化多端并发下两种到达序的最终态。
 *
 * 物理不变量 INV：物理 COMPLETED 节点不得有有效活跃直接子
 *   —— 等价于「有效活跃节点的祖先链不得有物理 COMPLETED」（完成时子的有效状态跟随父，由 effectiveStatus 自动保证：
 *   有 COMPLETED 祖先则有效变 completed 非活跃，故有效活跃者必无 COMPLETED 祖先）。
 * reopen/restore/restore_from_trash 向上拉回只翻物理 COMPLETED 祖先；
 * 被搁置/删除的祖先挡住则不拉回（搁置/回收站绝对性），子自身状态保真、有效状态跟随祖先。
 *
 * 命名：parent/child/grandchild 表父子链角色（不用 A/D 这种无语义字母）。
 */

const ACTIVE = EXPLICIT_STATUS.ACTIVE
const COMPLETED = EXPLICIT_STATUS.COMPLETED
const HOLD = EXPLICIT_STATUS.HOLD
const DELETED = EXPLICIT_STATUS.DELETED

function push(state: ReturnType<typeof makeState>, commands: GtdCommand[]) {
  return applyPush(state, { mutations: [], commands, lastSyncId: 0 })
}

function statusOf(rows: EntityRow[], id: string): string | undefined {
  return field<string>(findRow(rows, 'task', id), 'status')
}

function liveTasks(rows: EntityRow[]): EntityRowOf<'task'>[] {
  return rows.filter((r): r is EntityRowOf<'task'> => r.entity === 'task' && !r.deleted)
}

/** 物理不变量 INV：有效活跃节点的祖先链不得有物理 COMPLETED（完成时子的有效状态跟随父，由 effectiveStatus 自动保证）。 */
function assertInvariant(rows: EntityRow[]): void {
  const tree: TaskTree = buildTaskTree(liveTasks(rows))
  for (const t of liveTasks(rows)) {
    if (effectiveStatus(t, tree) !== ACTIVE)
      continue
    for (const anc of ancestors(tree, t.id)) {
      expect(anc.data.status, `有效活跃 ${t.id} 的祖先 ${anc.id} 不得物理 completed（完成时子的有效状态跟随父）`).not.toBe(COMPLETED)
    }
  }
}

/** 两种到达序各跑一遍，返回两个最终态（firstThenSecond / secondThenFirst）。 */
function bothOrders(
  state: ReturnType<typeof makeState>,
  first: GtdCommand,
  second: GtdCommand,
) {
  const firstThenSecond = push(push(state, [first]).state, [second])
  const secondThenFirst = push(push(state, [second]).state, [first])
  return { firstThenSecond, secondThenFirst }
}

// ============================================================
// 祖先向下级联 × 后代向上激活（核心危险矩阵）
// ============================================================

describe('到达序：祖先向下级联 × 后代向上激活', () => {
  it('complete(父) 与 reopen(子) 两种序都不破坏不变量', () => {
    const state = makeState([
      makeTaskRow('parent', { status: ACTIVE }, { syncId: 1 }),
      makeTaskRow('child', { parentId: 'parent', status: COMPLETED, completedAt: SYNC_NOW }, { syncId: 2 }),
    ])
    const { firstThenSecond, secondThenFirst } = bothOrders(
      state,
      makeCommand({ id: 'c-complete', type: 'complete', taskId: 'parent' }),
      makeCommand({ id: 'c-reopen', type: 'reopen', taskId: 'child' }),
    )
    // complete 先：parent→completed（child 已 completed 跳过）；reopen(child)→child active + 向上 parent→active
    expect(statusOf(firstThenSecond.state.rows, 'parent')).toBe(ACTIVE)
    expect(statusOf(firstThenSecond.state.rows, 'child')).toBe(ACTIVE)
    // reopen 先：child active；complete(parent)→parent completed（完成，子的有效状态跟随完成变完成，child 自身状态保真活跃）
    expect(statusOf(secondThenFirst.state.rows, 'parent')).toBe(COMPLETED)
    expect(statusOf(secondThenFirst.state.rows, 'child')).toBe(ACTIVE)
    expect(secondThenFirst.response.rejected.map(r => r.id)).not.toContain('c-complete')
    assertInvariant(firstThenSecond.state.rows)
    assertInvariant(secondThenFirst.state.rows)
  })

  it('complete(父) 与 restore(子) 两种序都不破坏不变量', () => {
    const state = makeState([
      makeTaskRow('parent', { status: ACTIVE }, { syncId: 1 }),
      makeTaskRow('child', { parentId: 'parent', status: HOLD, heldAt: SYNC_NOW }, { syncId: 2 }),
    ])
    const { firstThenSecond, secondThenFirst } = bothOrders(
      state,
      makeCommand({ id: 'c-complete', type: 'complete', taskId: 'parent' }),
      makeCommand({ id: 'c-restore', type: 'restore', taskId: 'child' }),
    )
    // complete 先：parent→completed（child hold 跳过）；restore(child)→child active + 向上 parent(completed)→active
    expect(statusOf(firstThenSecond.state.rows, 'parent')).toBe(ACTIVE)
    expect(statusOf(firstThenSecond.state.rows, 'child')).toBe(ACTIVE)
    // restore 先：child active；complete(parent)→parent completed（完成，子的有效状态跟随完成变完成，child 自身状态保真活跃）
    expect(statusOf(secondThenFirst.state.rows, 'parent')).toBe(COMPLETED)
    expect(statusOf(secondThenFirst.state.rows, 'child')).toBe(ACTIVE)
    expect(secondThenFirst.response.rejected.map(r => r.id)).not.toContain('c-complete')
    assertInvariant(firstThenSecond.state.rows)
    assertInvariant(secondThenFirst.state.rows)
  })

  it('drop(父) 与 reopen(子) 两种序都不破坏不变量', () => {
    const state = makeState([
      makeTaskRow('parent', { status: ACTIVE }, { syncId: 1 }),
      makeTaskRow('child', { parentId: 'parent', status: COMPLETED, completedAt: SYNC_NOW }, { syncId: 2 }),
    ])
    const { firstThenSecond, secondThenFirst } = bothOrders(
      state,
      makeCommand({ id: 'c-drop', type: 'drop', taskId: 'parent' }),
      makeCommand({ id: 'c-reopen', type: 'reopen', taskId: 'child' }),
    )
    // drop 先：parent→hold（child completed 跳过）；reopen(child)→child active + parent 搁置时不向上翻→parent 保持 hold
    expect(statusOf(firstThenSecond.state.rows, 'parent')).toBe(HOLD)
    expect(statusOf(firstThenSecond.state.rows, 'child')).toBe(ACTIVE)
    // reopen 先：child active；drop(parent)→parent hold（不改子任务自身状态，child active 自身状态保真）
    expect(statusOf(secondThenFirst.state.rows, 'parent')).toBe(HOLD)
    expect(statusOf(secondThenFirst.state.rows, 'child')).toBe(ACTIVE)
    assertInvariant(firstThenSecond.state.rows)
    assertInvariant(secondThenFirst.state.rows)
  })

  it('drop(父) 与 restore(子) 两种序都不破坏不变量', () => {
    const state = makeState([
      makeTaskRow('parent', { status: ACTIVE }, { syncId: 1 }),
      makeTaskRow('child', { parentId: 'parent', status: HOLD, heldAt: SYNC_NOW }, { syncId: 2 }),
    ])
    const { firstThenSecond, secondThenFirst } = bothOrders(
      state,
      makeCommand({ id: 'c-drop', type: 'drop', taskId: 'parent' }),
      makeCommand({ id: 'c-restore', type: 'restore', taskId: 'child' }),
    )
    // drop 先：parent→hold（child hold 跳过）；restore(child)→child active + parent 搁置时不向上翻→parent 保持 hold
    expect(statusOf(firstThenSecond.state.rows, 'parent')).toBe(HOLD)
    expect(statusOf(firstThenSecond.state.rows, 'child')).toBe(ACTIVE)
    // restore 先：child active；drop(parent)→parent hold（不改子任务自身状态，child active 自身状态保真）
    expect(statusOf(secondThenFirst.state.rows, 'parent')).toBe(HOLD)
    expect(statusOf(secondThenFirst.state.rows, 'child')).toBe(ACTIVE)
    assertInvariant(firstThenSecond.state.rows)
    assertInvariant(secondThenFirst.state.rows)
  })

  it('delete(父) 与 重开子：delete 不改子任务自身状态，子自身状态保真（两序都 parent 删除 / child 活跃）', () => {
    const state = makeState([
      makeTaskRow('parent', { status: ACTIVE }, { syncId: 1 }),
      makeTaskRow('child', { parentId: 'parent', status: COMPLETED, completedAt: SYNC_NOW }, { syncId: 2 }),
    ])
    const { firstThenSecond, secondThenFirst } = bothOrders(
      state,
      makeCommand({ id: 'c-delete', type: 'delete', taskId: 'parent' }),
      makeCommand({ id: 'c-reopen', type: 'reopen', taskId: 'child' }),
    )
    // delete 先：parent deleted（不改子任务自身状态，child completed 自身状态保真）；reopen(child)→child active + parent 删除时不向上翻
    expect(statusOf(firstThenSecond.state.rows, 'parent')).toBe(DELETED)
    expect(statusOf(firstThenSecond.state.rows, 'child')).toBe(ACTIVE)
    // reopen 先：child active；delete(parent)→parent deleted（不改子任务自身状态，child active 自身状态保真）
    expect(statusOf(secondThenFirst.state.rows, 'parent')).toBe(DELETED)
    expect(statusOf(secondThenFirst.state.rows, 'child')).toBe(ACTIVE)
    assertInvariant(firstThenSecond.state.rows)
    assertInvariant(secondThenFirst.state.rows)
  })

  it('delete(父) 与 恢复子：delete 不改子任务自身状态，子自身状态保真（两序都 parent 删除 / child 活跃）', () => {
    const state = makeState([
      makeTaskRow('parent', { status: ACTIVE }, { syncId: 1 }),
      makeTaskRow('child', { parentId: 'parent', status: HOLD, heldAt: SYNC_NOW }, { syncId: 2 }),
    ])
    const { firstThenSecond, secondThenFirst } = bothOrders(
      state,
      makeCommand({ id: 'c-delete', type: 'delete', taskId: 'parent' }),
      makeCommand({ id: 'c-restore', type: 'restore', taskId: 'child' }),
    )
    // delete 先：parent deleted（不改子任务自身状态，child hold 自身状态保真）；restore(child)→child active + parent 删除时不向上翻
    expect(statusOf(firstThenSecond.state.rows, 'parent')).toBe(DELETED)
    expect(statusOf(firstThenSecond.state.rows, 'child')).toBe(ACTIVE)
    // restore 先：child active；delete(parent)→parent deleted（不改子任务自身状态，child active 自身状态保真）
    expect(statusOf(secondThenFirst.state.rows, 'parent')).toBe(DELETED)
    expect(statusOf(secondThenFirst.state.rows, 'child')).toBe(ACTIVE)
    assertInvariant(firstThenSecond.state.rows)
    assertInvariant(secondThenFirst.state.rows)
  })
})

// ============================================================
// 多级祖先链向上激活
// ============================================================

describe('到达序：多级祖先链向上激活', () => {
  it('reopen(孙) 向上翻整条 completed 链（父/子/孙全 active）', () => {
    const state = makeState([
      makeTaskRow('parent', { status: COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 }),
      makeTaskRow('child', { parentId: 'parent', status: COMPLETED, completedAt: SYNC_NOW }, { syncId: 2 }),
      makeTaskRow('grandchild', { parentId: 'child', status: COMPLETED, completedAt: SYNC_NOW }, { syncId: 3 }),
    ])
    const { state: next } = push(state, [makeCommand({ id: 'c-reopen', type: 'reopen', taskId: 'grandchild' })])
    expect(statusOf(next.rows, 'grandchild')).toBe(ACTIVE)
    expect(statusOf(next.rows, 'child')).toBe(ACTIVE)
    expect(statusOf(next.rows, 'parent')).toBe(ACTIVE)
    assertInvariant(next.rows)
  })

  it('重开孙 → 搁置的祖先挡住，只翻自身（不翻搁置/完成祖先）', () => {
    // parent=completed, child=hold, grandchild=completed
    // reopen(grandchild) 遇 child 搁置挡住 → 拉回不触发；只翻 grandchild 自身。
    // grandchild reopen 后物理活跃；逐层下子的有效状态跟随 parent completed 变 completed（自身状态保真，child/parent 不动，不破坏物理不变量）。
    const state = makeState([
      makeTaskRow('parent', { status: COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 }),
      makeTaskRow('child', { parentId: 'parent', status: HOLD, heldAt: SYNC_NOW }, { syncId: 2 }),
      makeTaskRow('grandchild', { parentId: 'child', status: COMPLETED, completedAt: SYNC_NOW }, { syncId: 3 }),
    ])
    const { state: next } = push(state, [makeCommand({ id: 'c-reopen', type: 'reopen', taskId: 'grandchild' })])
    expect(statusOf(next.rows, 'grandchild')).toBe(ACTIVE)
    expect(statusOf(next.rows, 'child')).toBe(HOLD)
    expect(statusOf(next.rows, 'parent')).toBe(COMPLETED)
    assertInvariant(next.rows)
  })

  it('恢复孙 → 搁置的祖先挡住，只翻自身（不翻完成/搁置祖先）', () => {
    // parent=hold, child=completed, grandchild=hold
    // restore(grandchild) 遇 parent 搁置挡住 → 拉回不触发；只翻 grandchild 自身。
    const state = makeState([
      makeTaskRow('parent', { status: HOLD, heldAt: SYNC_NOW }, { syncId: 1 }),
      makeTaskRow('child', { parentId: 'parent', status: COMPLETED, completedAt: SYNC_NOW }, { syncId: 2 }),
      makeTaskRow('grandchild', { parentId: 'child', status: HOLD, heldAt: SYNC_NOW }, { syncId: 3 }),
    ])
    const { state: next } = push(state, [makeCommand({ id: 'c-restore', type: 'restore', taskId: 'grandchild' })])
    expect(statusOf(next.rows, 'grandchild')).toBe(ACTIVE)
    expect(statusOf(next.rows, 'child')).toBe(COMPLETED)
    expect(statusOf(next.rows, 'parent')).toBe(HOLD)
    assertInvariant(next.rows)
  })
})

// ============================================================
// 同节点命令：last-arrival-wins（后到者生效，先到者被 reject）
// ============================================================

describe('到达序：同节点命令 last-arrival-wins', () => {
  it('complete 与 drop 作用同一任务：后到者生效，先到者被 reject', () => {
    const state = makeState([makeTaskRow('task', { status: ACTIVE }, { syncId: 1 })])
    const { firstThenSecond, secondThenFirst } = bothOrders(
      state,
      makeCommand({ id: 'c-complete', type: 'complete', taskId: 'task' }),
      makeCommand({ id: 'c-drop', type: 'drop', taskId: 'task' }),
    )
    // complete 先→completed；drop on completed→reject，保持 completed
    expect(statusOf(firstThenSecond.state.rows, 'task')).toBe(COMPLETED)
    expect(firstThenSecond.response.rejected.map(r => r.id)).toContain('c-drop')
    // drop 先→hold；complete on hold→reject，保持 hold
    expect(statusOf(secondThenFirst.state.rows, 'task')).toBe(HOLD)
    expect(secondThenFirst.response.rejected.map(r => r.id)).toContain('c-complete')
    assertInvariant(firstThenSecond.state.rows)
    assertInvariant(secondThenFirst.state.rows)
  })
})

// ============================================================
// restore_from_trash 向上激活（与 reopen/restore 同机制）
// ============================================================

describe('到达序：restore_from_trash 向上激活（与 reopen/restore 同机制）', () => {
  it('complete(父) 与 restore_from_trash(子) 两种序都不破坏不变量', () => {
    // 初始 parent=ACTIVE, child=DELETED（child 先前被单独删，parent 仍活跃）
    const state = makeState([
      makeTaskRow('parent', { status: ACTIVE }, { syncId: 1 }),
      makeTaskRow('child', { parentId: 'parent', status: DELETED, droppedAt: SYNC_NOW }, { syncId: 2 }),
    ])
    const { firstThenSecond, secondThenFirst } = bothOrders(
      state,
      makeCommand({ id: 'c-complete', type: 'complete', taskId: 'parent' }),
      makeCommand({ id: 'c-restore-trash', type: 'restore_from_trash', taskId: 'child' }),
    )
    // complete 先：parent→completed（child DELETED 跳过）；restore_from_trash(child)→child active + 向上 parent(completed)→active
    expect(statusOf(firstThenSecond.state.rows, 'parent')).toBe(ACTIVE)
    expect(statusOf(firstThenSecond.state.rows, 'child')).toBe(ACTIVE)
    // restore_from_trash 先：child active；complete(parent)→parent completed（完成，子的有效状态跟随完成变完成，child 自身状态保真活跃）
    expect(statusOf(secondThenFirst.state.rows, 'parent')).toBe(COMPLETED)
    expect(statusOf(secondThenFirst.state.rows, 'child')).toBe(ACTIVE)
    expect(secondThenFirst.response.rejected.map(r => r.id)).not.toContain('c-complete')
    assertInvariant(firstThenSecond.state.rows)
    assertInvariant(secondThenFirst.state.rows)
  })

  it('delete(父) 与 restore_from_trash(子) 两种序都不破坏不变量', () => {
    const state = makeState([
      makeTaskRow('parent', { status: ACTIVE }, { syncId: 1 }),
      makeTaskRow('child', { parentId: 'parent', status: DELETED, droppedAt: SYNC_NOW }, { syncId: 2 }),
    ])
    const { firstThenSecond, secondThenFirst } = bothOrders(
      state,
      makeCommand({ id: 'c-delete', type: 'delete', taskId: 'parent' }),
      makeCommand({ id: 'c-restore-trash', type: 'restore_from_trash', taskId: 'child' }),
    )
    // delete 先：parent→deleted（child 已 DELETED 跳过）；restore_from_trash(child)→child active + parent 删除时不向上翻→parent 保持 deleted
    expect(statusOf(firstThenSecond.state.rows, 'parent')).toBe(DELETED)
    expect(statusOf(firstThenSecond.state.rows, 'child')).toBe(ACTIVE)
    // restore_from_trash 先：child active；delete(parent)→parent deleted（不改子任务自身状态，child active 自身状态保真）
    expect(statusOf(secondThenFirst.state.rows, 'parent')).toBe(DELETED)
    expect(statusOf(secondThenFirst.state.rows, 'child')).toBe(ACTIVE)
    assertInvariant(firstThenSecond.state.rows)
    assertInvariant(secondThenFirst.state.rows)
  })
})
