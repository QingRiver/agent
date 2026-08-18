/**
 * 状态机行为规约（SP-STATE-*）。
 * 每条 `it` 上方 `// SP-STATE-N` 与 `wiki/draft/gtd行为规约.md` 一一对应。
 * 实现在 `command/state-machine.ts`（complete/drop/reopen/restore/deleteTask，经 applyPush 驱动）；
 * 级联计划委托 L3 `inheritance/cascade.ts`（complete/drop/delete 不改子任务自身状态；reopen/restore 仅自身）。
 */
import type { EntityRowOf, GtdCommand, GtdMutation, SyncState } from '../sync/apply'
import { describe, expect, it } from 'vitest'
import { EXPLICIT_STATUS, GROUP_TYPE } from '../data/types'
import {
  field,
  findRow,
  makeCommand,
  makeMutation,
  makeState,
  makeTaskRow,
  SYNC_NOW,
} from '../fixtures'
import { effectiveStatus } from '../inheritance/effective'
import { buildTaskTree } from '../structure/tree'
import { applyPush } from '../sync/apply'

function runCmd(state: SyncState, cmd: GtdCommand) {
  return applyPush(state, { mutations: [], commands: [cmd], lastSyncId: 0 })
}
function runMut(state: SyncState, mut: GtdMutation) {
  return applyPush(state, { mutations: [mut], commands: [], lastSyncId: 0 })
}

describe('状态机 [SP-STATE]', () => {
  // SP-STATE-1: 创建 → 活跃（create_task 命令建行 status=ACTIVE）
  it('新建任务 status=ACTIVE [SP-STATE-1]', () => {
    const state = makeState([])
    const res = runCmd(state, makeCommand({ id: 'c1', type: 'create_task', taskId: 't1', name: 'x', parentId: null, order: 0, mountDirId: null }))
    const t = findRow(res.state.rows, 'task', 't1')
    expect(field<string>(t, 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
  })

  // SP-STATE-2: 活跃→已完成；仅 active 可 complete；completed 幂等 noop；hold/deleted 拒绝
  describe('complete [SP-STATE-2]', () => {
    it('active → COMPLETED，completedAt 置位，syncId 推进', () => {
      const state = makeState([makeTaskRow('t1', {}, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'complete', taskId: 't1' }))
      expect(res.response.applied).toContain('c1')
      expect(res.response.rejected).toHaveLength(0)
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(field<string>(t, 'status')).toBe(EXPLICIT_STATUS.COMPLETED)
      expect(field<string>(t, 'completedAt')).toBe(SYNC_NOW)
      expect(t.syncId).toBe(2)
    })
    it('completed → noop（幂等 ack，状态不变）', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'complete', taskId: 't1' }))
      expect(res.response.applied).toContain('c1')
      expect(res.response.rejected).toHaveLength(0)
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(t.syncId).toBe(1) // noop 不推进 syncId
    })
    it('hold → 拒绝（rejected）', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.HOLD, heldAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'complete', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(1)
      expect(field<string>(findRow(res.state.rows, 'task', 't1'), 'status')).toBe(EXPLICIT_STATUS.HOLD)
    })
    it('deleted → 拒绝', () => {
      const state = makeState([makeTaskRow('t1', {}, { syncId: 1, deleted: true })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'complete', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(1)
    })
  })

  // SP-STATE-3: 已完成→活跃（reopen）；仅 completed 可重开；active 幂等；hold/deleted 拒绝；重复任务拒重开
  describe('reopen [SP-STATE-3]', () => {
    it('completed → ACTIVE，completedAt 清空，syncId 推进', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'reopen', taskId: 't1' }))
      expect(res.response.applied).toContain('c1')
      expect(res.response.rejected).toHaveLength(0)
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(field<string>(t, 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
      expect(field(t, 'completedAt')).toBeNull()
      expect(t.syncId).toBe(2)
    })
    it('active → noop（幂等，状态不变 syncId 不推进）', () => {
      const state = makeState([makeTaskRow('t1', {}, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'reopen', taskId: 't1' }))
      expect(res.response.applied).toContain('c1')
      expect(res.response.rejected).toHaveLength(0)
      expect(findRow(res.state.rows, 'task', 't1')!.syncId).toBe(1)
    })
    it('hold → 拒绝（reopen 只作用于 COMPLETED）', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.HOLD, heldAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'reopen', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(1)
      expect(field<string>(findRow(res.state.rows, 'task', 't1'), 'status')).toBe(EXPLICIT_STATUS.HOLD)
    })
    it('deleted → 拒绝', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.DELETED, droppedAt: SYNC_NOW }, { syncId: 1, deleted: true })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'reopen', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(1)
    })
    it('重复任务(repeatRuleId≠null) COMPLETED → 拒重开 [SP-INV-REPEAT-REOPEN]', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW, repeatRuleId: 'r1' }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'reopen', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(1)
      expect(res.response.rejected[0]?.reason ?? '').toContain('SP-INV-REPEAT-REOPEN')
    })
    it('reopen 子 → 向上翻 COMPLETED 祖先链（父/祖父都→ACTIVE）', () => {
      const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 })
      const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 2 })
      const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 3 })
      const res = runCmd(makeState([gp, p, c]), makeCommand({ id: 'c1', type: 'reopen', taskId: 'c' }))
      expect(res.response.rejected).toHaveLength(0)
      for (const id of ['c', 'p', 'gp']) {
        const t = findRow(res.state.rows, 'task', id)!
        expect(field<string>(t, 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
        expect(field(t, 'completedAt')).toBeNull()
      }
    })
    it('重开子 → 搁置的父挡住，只翻自身（搁置的父不动）', () => {
      const p = makeTaskRow('p', { status: EXPLICIT_STATUS.HOLD, heldAt: SYNC_NOW }, { syncId: 1 })
      const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 2 })
      const res = runCmd(makeState([p, c]), makeCommand({ id: 'c1', type: 'reopen', taskId: 'c' }))
      expect(res.response.rejected).toHaveLength(0)
      // p 搁置挡住 → 拉回不触发；只翻 c 自身 completed→active
      expect(field<string>(findRow(res.state.rows, 'task', 'p'), 'status')).toBe(EXPLICIT_STATUS.HOLD)
      expect(field(findRow(res.state.rows, 'task', 'p'), 'heldAt')).toBe(SYNC_NOW)
      expect(field<string>(findRow(res.state.rows, 'task', 'c'), 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
    })
  })

  // SP-STATE-4: 活跃→已取消/搁置（drop）；仅 active；hold 幂等；completed/deleted 拒绝
  describe('drop [SP-STATE-4]', () => {
    it('active → HOLD，heldAt 置位', () => {
      const state = makeState([makeTaskRow('t1', {}, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'drop', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(0)
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(field<string>(t, 'status')).toBe(EXPLICIT_STATUS.HOLD)
      expect(field<string>(t, 'heldAt')).toBe(SYNC_NOW)
    })
    it('hold → noop（幂等）', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.HOLD, heldAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'drop', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(0)
      expect(findRow(res.state.rows, 'task', 't1')!.syncId).toBe(1)
    })
    it('completed → 拒绝', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'drop', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(1)
    })
  })

  // SP-STATE-5: 已取消→活跃（restore）；仅 hold 可恢复；active 幂等；completed/deleted 拒绝
  describe('restore [SP-STATE-5]', () => {
    it('hold → ACTIVE，heldAt 清空，syncId 推进', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.HOLD, heldAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'restore', taskId: 't1' }))
      expect(res.response.applied).toContain('c1')
      expect(res.response.rejected).toHaveLength(0)
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(field<string>(t, 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
      expect(field(t, 'heldAt')).toBeNull()
      expect(t.syncId).toBe(2)
    })
    it('active → noop（幂等）', () => {
      const state = makeState([makeTaskRow('t1', {}, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'restore', taskId: 't1' }))
      expect(res.response.applied).toContain('c1')
      expect(res.response.rejected).toHaveLength(0)
      expect(findRow(res.state.rows, 'task', 't1')!.syncId).toBe(1)
    })
    it('completed → 拒绝（restore 只作用于 HOLD）', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'restore', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(1)
      expect(field<string>(findRow(res.state.rows, 'task', 't1'), 'status')).toBe(EXPLICIT_STATUS.COMPLETED)
    })
    it('恢复子 → 搁置的祖先挡住，只翻自身（父/祖父搁置不动）', () => {
      const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.HOLD, heldAt: SYNC_NOW }, { syncId: 1 })
      const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.HOLD, heldAt: SYNC_NOW }, { syncId: 2 })
      const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.HOLD, heldAt: SYNC_NOW }, { syncId: 3 })
      const res = runCmd(makeState([gp, p, c]), makeCommand({ id: 'c1', type: 'restore', taskId: 'c' }))
      expect(res.response.rejected).toHaveLength(0)
      // gp/p 搁置挡住 → 拉回不触发；只翻 c 自身 hold→active
      expect(field<string>(findRow(res.state.rows, 'task', 'c'), 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
      expect(field(findRow(res.state.rows, 'task', 'c'), 'heldAt')).toBeNull()
      expect(field<string>(findRow(res.state.rows, 'task', 'p'), 'status')).toBe(EXPLICIT_STATUS.HOLD)
      expect(field<string>(findRow(res.state.rows, 'task', 'gp'), 'status')).toBe(EXPLICIT_STATUS.HOLD)
    })
    it('restore 子 → 向上翻 COMPLETED 祖先（COMPLETED 父也→ACTIVE）', () => {
      const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 })
      const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.HOLD, heldAt: SYNC_NOW }, { syncId: 2 })
      const res = runCmd(makeState([p, c]), makeCommand({ id: 'c1', type: 'restore', taskId: 'c' }))
      expect(res.response.rejected).toHaveLength(0)
      expect(field<string>(findRow(res.state.rows, 'task', 'p'), 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
      expect(field(findRow(res.state.rows, 'task', 'p'), 'completedAt')).toBeNull()
      expect(field<string>(findRow(res.state.rows, 'task', 'c'), 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
    })
  })

  // SP-STATE-6: 活跃→已删除（deleteTask command）；仅 active 可删；deleted 幂等；completed/hold 拒绝
  describe('deleteTask [SP-STATE-6]', () => {
    it('active → DELETED，droppedAt 置位，syncId 推进', () => {
      const state = makeState([makeTaskRow('t1', {}, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'delete', taskId: 't1' }))
      expect(res.response.applied).toContain('c1')
      expect(res.response.rejected).toHaveLength(0)
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(field<string>(t, 'status')).toBe(EXPLICIT_STATUS.DELETED)
      expect(field<string>(t, 'droppedAt')).toBe(SYNC_NOW)
      expect(t.syncId).toBe(2)
    })
    it('completed → DELETED（进回收站）：completedAt 清空 + droppedAt 盖戳', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'delete', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(0)
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(field<string>(t, 'status')).toBe(EXPLICIT_STATUS.DELETED)
      expect(field<string>(t, 'droppedAt')).toBe(SYNC_NOW)
      expect(field(t, 'completedAt')).toBeNull()
    })
    it('hold → DELETED（进回收站）：heldAt 清空 + droppedAt 盖戳', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.HOLD, heldAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'delete', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(0)
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(field<string>(t, 'status')).toBe(EXPLICIT_STATUS.DELETED)
      expect(field<string>(t, 'droppedAt')).toBe(SYNC_NOW)
      expect(field(t, 'heldAt')).toBeNull()
    })
    it('deleted → noop（幂等 ack，状态不变）', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.DELETED, droppedAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'delete', taskId: 't1' }))
      expect(res.response.applied).toContain('c1')
      expect(res.response.rejected).toHaveLength(0)
      expect(findRow(res.state.rows, 'task', 't1')!.syncId).toBe(1)
    })
    it('不改子任务自身状态：delete 父 → p 物理删除；子自身状态保真但有效状态都进回收站视图', () => {
      const p = makeTaskRow('p', {}, { syncId: 1 })
      const c1 = makeTaskRow('c1', { parentId: 'p' }, { syncId: 2 })
      const c2 = makeTaskRow('c2', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 3 })
      const res = runCmd(makeState([p, c1, c2]), makeCommand({ id: 'd1', type: 'delete', taskId: 'p' }))
      expect(res.response.rejected).toHaveLength(0)
      // 物理：只 p 进站，c1/c2 自身状态保真（活跃/完成 不变）
      expect(field<string>(findRow(res.state.rows, 'task', 'p'), 'status')).toBe(EXPLICIT_STATUS.DELETED)
      expect(field<string>(findRow(res.state.rows, 'task', 'p'), 'droppedAt')).toBe(SYNC_NOW)
      expect(field<string>(findRow(res.state.rows, 'task', 'c1'), 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
      expect(field<string>(findRow(res.state.rows, 'task', 'c2'), 'status')).toBe(EXPLICIT_STATUS.COMPLETED)
      expect(field<string>(findRow(res.state.rows, 'task', 'c2'), 'completedAt')).toBe(SYNC_NOW)
      // effective 视图：c1/c2 的有效状态跟随 p 的 deleted → 都进回收站视图
      const live = res.state.rows.filter((r): r is EntityRowOf<'task'> => r.entity === 'task' && !r.deleted)
      const tree = buildTaskTree(live)
      expect(effectiveStatus(live.find(r => r.id === 'c1')!, tree)).toBe(EXPLICIT_STATUS.DELETED)
      expect(effectiveStatus(live.find(r => r.id === 'c2')!, tree)).toBe(EXPLICIT_STATUS.DELETED)
    })
  })

  // SP-STATE-7: 回收站 live 行 upsert noop；已 purge tombstone → REMOTE_PURGED（不 LWW 写活）
  describe('终态锁 / purge [SP-STATE-7]', () => {
    it('回收站 live（status=DELETED, envelope 未删）：upsert noop，不写活', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.DELETED, droppedAt: SYNC_NOW, name: '在站' }, { syncId: 1 })])
      const res = runMut(state, makeMutation({ id: 'm1', entityId: 't1', patch: { name: '复活' } }))
      expect(res.response.applied).toContain('m1')
      expect(res.response.rejected).toHaveLength(0)
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(t.deleted).toBe(false)
      expect(field<string>(t, 'name')).toBe('在站')
    })
    it('已 purge（envelope.deleted + status=DELETED）：upsert → REMOTE_PURGED，不写活', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.DELETED, droppedAt: SYNC_NOW, name: '写周报' }, { syncId: 1, deleted: true })])
      const res = runMut(state, makeMutation({ id: 'm1', entityId: 't1', patch: { name: '复活' } }))
      expect(res.response.rejected).toHaveLength(1)
      expect(res.response.rejected[0]?.reason).toBe('REMOTE_PURGED:写周报')
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(t.deleted).toBe(true)
      expect(field<string>(t, 'name')).toBe('写周报')
    })
    it('已 purge：command → REMOTE_PURGED', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.DELETED, droppedAt: SYNC_NOW, name: '写周报' }, { syncId: 1, deleted: true })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'complete', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(1)
      expect(res.response.rejected[0]?.reason).toBe('REMOTE_PURGED:写周报')
    })
    it('边界：sync 软删(status=ACTIVE, deleted=true) 仍走 LWW 复活（锁仅作用于 purged）', () => {
      const state = makeState([makeTaskRow('t1', {}, { syncId: 1, deleted: true })])
      const res = runMut(state, makeMutation({ id: 'm1', entityId: 't1', patch: { name: '复活' } }))
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(t.deleted).toBe(false)
      expect(field<string>(t, 'name')).toBe('复活')
    })
  })

  describe('restoreFromTrash', () => {
    it('deleted → ACTIVE，清 droppedAt', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.DELETED, droppedAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'restore_from_trash', taskId: 't1' }))
      expect(res.response.applied).toContain('c1')
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(field<string>(t, 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
      expect(field<string | null>(t, 'droppedAt')).toBeNull()
    })
    it('仅自身：子任务仍留在回收站', () => {
      const p = makeTaskRow('p', { status: EXPLICIT_STATUS.DELETED, droppedAt: SYNC_NOW }, { syncId: 1 })
      const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.DELETED, droppedAt: SYNC_NOW }, { syncId: 2 })
      const res = runCmd(makeState([p, c]), makeCommand({ id: 'c1', type: 'restore_from_trash', taskId: 'p' }))
      expect(field<string>(findRow(res.state.rows, 'task', 'p'), 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
      expect(field<string>(findRow(res.state.rows, 'task', 'c'), 'status')).toBe(EXPLICIT_STATUS.DELETED)
    })
    it('active → noop', () => {
      const state = makeState([makeTaskRow('t1', {}, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'restore_from_trash', taskId: 't1' }))
      expect(res.response.applied).toContain('c1')
      expect(findRow(res.state.rows, 'task', 't1')!.syncId).toBe(1)
    })
    it('hold → 拒绝', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.HOLD, heldAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'restore_from_trash', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(1)
    })
    it('子 → 删除的祖先挡住，只翻自身（救子不连带救父出回收站）', () => {
      const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.DELETED, droppedAt: SYNC_NOW }, { syncId: 1 })
      const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.DELETED, droppedAt: SYNC_NOW }, { syncId: 2 })
      const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.DELETED, droppedAt: SYNC_NOW }, { syncId: 3 })
      const res = runCmd(makeState([gp, p, c]), makeCommand({ id: 'c1', type: 'restore_from_trash', taskId: 'c' }))
      expect(res.response.rejected).toHaveLength(0)
      // 回收站绝对性：救子不连带救父；gp/p 删除挡住，只翻 c 自身
      expect(field<string>(findRow(res.state.rows, 'task', 'c'), 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
      expect(field(findRow(res.state.rows, 'task', 'c'), 'droppedAt')).toBeNull()
      expect(field<string>(findRow(res.state.rows, 'task', 'p'), 'status')).toBe(EXPLICIT_STATUS.DELETED)
      expect(field<string>(findRow(res.state.rows, 'task', 'gp'), 'status')).toBe(EXPLICIT_STATUS.DELETED)
    })
    it('delete(COMPLETED) → restore_from_trash 回 ACTIVE，所有终态戳全清', () => {
      const s0 = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 })])
      const s1 = runCmd(s0, makeCommand({ id: 'd1', type: 'delete', taskId: 't1' }))
      const res = runCmd(s1.state, makeCommand({ id: 'r1', type: 'restore_from_trash', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(0)
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(field<string>(t, 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
      expect(field(t, 'completedAt')).toBeNull()
      expect(field(t, 'heldAt')).toBeNull()
      expect(field(t, 'droppedAt')).toBeNull()
    })
  })

  // SP-STATE-8: 已完成↔已取消无直连边；reopen/restore 均只回 ACTIVE，不可互换
  describe('completed↔hold 无直连 [SP-STATE-8]', () => {
    it('reopen on HOLD → 拒绝（completed↔hold 无直连，须先 restore）', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.HOLD, heldAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'reopen', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(1)
      expect(field<string>(findRow(res.state.rows, 'task', 't1'), 'status')).toBe(EXPLICIT_STATUS.HOLD)
    })
    it('restore on COMPLETED → 拒绝（completed↔hold 无直连，须先 reopen）', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'restore', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(1)
      expect(field<string>(findRow(res.state.rows, 'task', 't1'), 'status')).toBe(EXPLICIT_STATUS.COMPLETED)
    })
    it('reopen 只回 ACTIVE（不跨到 HOLD）；restore 只回 ACTIVE（不跨到 COMPLETED）', () => {
      const rc = runCmd(
        makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 })]),
        makeCommand({ id: 'c1', type: 'reopen', taskId: 't1' }),
      )
      expect(field<string>(findRow(rc.state.rows, 'task', 't1'), 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
      expect(field(rc.state.rows.find(r => r.id === 't1'), 'completedAt')).toBeNull()

      const rs = runCmd(
        makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.HOLD, heldAt: SYNC_NOW }, { syncId: 1 })]),
        makeCommand({ id: 'c1', type: 'restore', taskId: 't1' }),
      )
      expect(field<string>(findRow(rs.state.rows, 'task', 't1'), 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
      expect(field(rs.state.rows.find(r => r.id === 't1'), 'heldAt')).toBeNull()
    })
  })

  // SP-STATE-9: createTask / moveTask 命令（建行/移动 + 拉回已完成祖先；共用 planUpwardActivation）
  describe('createTask / moveTask [SP-STATE-9]', () => {
    it('createTask：建行 status=ACTIVE + 必需字段落库 + syncId 推进', () => {
      const state = makeState([])
      const res = runCmd(state, makeCommand({
        id: 'c1',
        type: 'create_task',
        taskId: 't1',
        name: '新任务',
        parentId: null,
        order: 0,
        mountDirId: null,
      }))
      expect(res.response.applied).toContain('c1')
      expect(res.response.rejected).toHaveLength(0)
      const t = findRow(res.state.rows, 'task', 't1') as EntityRowOf<'task'>
      expect(t!.data.status).toBe(EXPLICIT_STATUS.ACTIVE)
      expect(t!.data.name).toBe('新任务')
      expect(t!.data.parentId).toBeNull()
      expect(t!.data.order).toBe(0)
      expect(t!.syncId).toBe(1)
    })

    it('createTask：挂已完成父下 → 拉回父 ACTIVE（活跃子挂已完成父不遗留违法态）', () => {
      const state = makeState([makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({
        id: 'c1',
        type: 'create_task',
        taskId: 'child',
        name: '子',
        parentId: 'p',
        order: 0,
        mountDirId: null,
      }))
      const p = findRow(res.state.rows, 'task', 'p') as EntityRowOf<'task'>
      expect(p!.data.status).toBe(EXPLICIT_STATUS.ACTIVE) // 拉回
      expect(p!.data.completedAt).toBeNull()
      const c = findRow(res.state.rows, 'task', 'child') as EntityRowOf<'task'>
      expect(c!.data.status).toBe(EXPLICIT_STATUS.ACTIVE)
    })

    it('createTask：挂已搁置父下 → 挡住不拉回（子有效变 hold，自身状态保真）', () => {
      const state = makeState([makeTaskRow('p', { status: EXPLICIT_STATUS.HOLD, heldAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({
        id: 'c1',
        type: 'create_task',
        taskId: 'child',
        name: '子',
        parentId: 'p',
        order: 0,
        mountDirId: null,
      }))
      const p = findRow(res.state.rows, 'task', 'p') as EntityRowOf<'task'>
      expect(p!.data.status).toBe(EXPLICIT_STATUS.HOLD) // 挡住不拉回
    })

    it('createTask：taskId 已存在 → 拒绝', () => {
      const state = makeState([makeTaskRow('t1', {}, { syncId: 1 })])
      const res = runCmd(state, makeCommand({
        id: 'c1',
        type: 'create_task',
        taskId: 't1',
        name: 'x',
        parentId: null,
        order: 0,
        mountDirId: null,
      }))
      expect(res.response.rejected).toHaveLength(1)
    })

    it('moveTask：从顶层移到已完成父下 → 拉回父 ACTIVE', () => {
      const state = makeState([
        makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 }),
        makeTaskRow('c', { parentId: null, status: EXPLICIT_STATUS.ACTIVE }, { syncId: 2 }),
      ])
      const res = runCmd(state, makeCommand({
        id: 'c1',
        type: 'move_task',
        taskId: 'c',
        parentId: 'p',
        order: 0,
      }))
      const c = findRow(res.state.rows, 'task', 'c') as EntityRowOf<'task'>
      expect(c!.data.parentId).toBe('p')
      expect(c!.data.order).toBe(0)
      const p = findRow(res.state.rows, 'task', 'p') as EntityRowOf<'task'>
      expect(p!.data.status).toBe(EXPLICIT_STATUS.ACTIVE) // 拉回
    })

    it('moveTask：移到已搁置父下 → 挡住不拉回', () => {
      const state = makeState([
        makeTaskRow('p', { status: EXPLICIT_STATUS.HOLD, heldAt: SYNC_NOW }, { syncId: 1 }),
        makeTaskRow('c', { parentId: null, status: EXPLICIT_STATUS.ACTIVE }, { syncId: 2 }),
      ])
      const res = runCmd(state, makeCommand({
        id: 'c1',
        type: 'move_task',
        taskId: 'c',
        parentId: 'p',
        order: 0,
      }))
      const p = findRow(res.state.rows, 'task', 'p') as EntityRowOf<'task'>
      expect(p!.data.status).toBe(EXPLICIT_STATUS.HOLD) // 挡住不拉回
    })

    it('moveTask：移动 completed task 到已完成父下 → 不拉回（自身有效非活跃不触发拉回）', () => {
      const state = makeState([
        makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 }),
        makeTaskRow('c', { parentId: null, status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 2 }),
      ])
      const res = runCmd(state, makeCommand({
        id: 'c1',
        type: 'move_task',
        taskId: 'c',
        parentId: 'p',
        order: 0,
      }))
      const p = findRow(res.state.rows, 'task', 'p') as EntityRowOf<'task'>
      expect(p!.data.status).toBe(EXPLICIT_STATUS.COMPLETED) // c 非有效活跃，不拉回
    })

    it('moveTask：移到自己子树下 → 拒绝（防环）', () => {
      // c 的子是 p；把 c 移到 p 下 = 环
      const state = makeState([
        makeTaskRow('p', { parentId: 'c', status: EXPLICIT_STATUS.ACTIVE }, { syncId: 1 }),
        makeTaskRow('c', { parentId: null, status: EXPLICIT_STATUS.ACTIVE }, { syncId: 2 }),
      ])
      const res = runCmd(state, makeCommand({
        id: 'c1',
        type: 'move_task',
        taskId: 'c',
        parentId: 'p',
        order: 0,
      }))
      expect(res.response.rejected).toHaveLength(1)
    })

    it('moveTask：新 parentId 不存在 → 拒绝', () => {
      const state = makeState([makeTaskRow('c', { parentId: null }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({
        id: 'c1',
        type: 'move_task',
        taskId: 'c',
        parentId: 'nope',
        order: 0,
      }))
      expect(res.response.rejected).toHaveLength(1)
    })
  })

  // SP-STATE-10: 串行后置可 complete（串行只管可执行性，不否决 complete）
  describe('串行后置可 complete [SP-STATE-10]', () => {
    it('串行父下：前序子活跃，后置子仍可 complete（不被串行否决）', () => {
      const state = makeState([
        makeTaskRow('p', { groupType: GROUP_TYPE.SEQUENTIAL }, { syncId: 1 }),
        makeTaskRow('c1', { parentId: 'p', order: 0, status: EXPLICIT_STATUS.ACTIVE }, { syncId: 2 }),
        makeTaskRow('c2', { parentId: 'p', order: 1, status: EXPLICIT_STATUS.ACTIVE }, { syncId: 3 }),
      ])
      // complete(后置子 c2)：c2 无有效活跃直接子 → 不否决；串行不阻止 complete
      const res = runCmd(state, makeCommand({ id: 'cmd', type: 'complete', taskId: 'c2' }))
      expect(res.response.applied).toContain('cmd')
      const c2 = findRow(res.state.rows, 'task', 'c2') as EntityRowOf<'task'>
      expect(c2!.data.status).toBe(EXPLICIT_STATUS.COMPLETED)
    })

    it('串行父下：complete(父) 子活跃 → 子的有效状态跟随完成变完成（不再否决）', () => {
      const state = makeState([
        makeTaskRow('p', { groupType: GROUP_TYPE.SEQUENTIAL }, { syncId: 1 }),
        makeTaskRow('c1', { parentId: 'p', order: 0, status: EXPLICIT_STATUS.ACTIVE }, { syncId: 2 }),
      ])
      // 完成时子的有效状态跟随父：complete(p) 不否决，p→completed，c1 有效变 completed（自身状态保真活跃）
      const res = runCmd(state, makeCommand({ id: 'cmd', type: 'complete', taskId: 'p' }))
      expect(res.response.applied).toContain('cmd')
      expect(res.response.rejected).toHaveLength(0)
      expect(field<string>(findRow(res.state.rows, 'task', 'p'), 'status')).toBe(EXPLICIT_STATUS.COMPLETED)
      expect(field<string>(findRow(res.state.rows, 'task', 'c1'), 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
    })
  })
})
