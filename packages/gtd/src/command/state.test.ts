/**
 * 状态机行为规约（SP-STATE-*）。
 * 每条 `it` 上方 `// SP-STATE-N` 与 `wiki/draft/gtd行为规约.md` 一一对应。
 * 实现在 `command/state-machine.ts`（complete/drop/reopen/restore/deleteTask，经 applyPush 驱动）；
 * 级联计划委托 L3 `inheritance/cascade.ts`（向下 complete/drop/delete、向上 reopen/restore）。
 */
import type { GtdCommand, GtdMutation, SyncState } from '../sync/apply'
import { describe, expect, it } from 'vitest'
import { EXPLICIT_STATUS } from '../data/types'
import {
  field,
  findRow,
  makeCommand,
  makeMutation,
  makeState,
  makeTask,
  makeTaskRow,
  SYNC_NOW,
} from '../fixtures'
import { applyPush } from '../sync/apply'

function runCmd(state: SyncState, cmd: GtdCommand) {
  return applyPush(state, { mutations: [], commands: [cmd], lastSyncId: 0 })
}
function runMut(state: SyncState, mut: GtdMutation) {
  return applyPush(state, { mutations: [mut], commands: [], lastSyncId: 0 })
}

describe('状态机 [SP-STATE]', () => {
  // SP-STATE-1: 创建 → 活跃（行模型真相：创建载荷携带 status=ACTIVE）
  it('新建任务 status=ACTIVE [SP-STATE-1]', () => {
    const state = makeState([])
    const res = runMut(state, makeMutation({ id: 'm1', entityId: 't1', patch: makeTask({ name: 'x' }) }))
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
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.HOLD, droppedAt: SYNC_NOW }, { syncId: 1 })])
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
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.HOLD, droppedAt: SYNC_NOW }, { syncId: 1 })])
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
    it('向上级联：reopen 子 → 链路 COMPLETED 祖先全转 ACTIVE（completedAt 清）', () => {
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
    it('向上级联不串扰 HOLD 祖先 [SP-LINK-STATE-6]', () => {
      const p = makeTaskRow('p', { status: EXPLICIT_STATUS.HOLD, droppedAt: SYNC_NOW }, { syncId: 1 })
      const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 2 })
      const res = runCmd(makeState([p, c]), makeCommand({ id: 'c1', type: 'reopen', taskId: 'c' }))
      expect(res.response.rejected).toHaveLength(0)
      expect(field<string>(findRow(res.state.rows, 'task', 'p'), 'status')).toBe(EXPLICIT_STATUS.HOLD)
      expect(field<string>(findRow(res.state.rows, 'task', 'p'), 'droppedAt')).toBe(SYNC_NOW)
      expect(field<string>(findRow(res.state.rows, 'task', 'c'), 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
    })
  })

  // SP-STATE-4: 活跃→已取消/搁置（drop）；仅 active；hold 幂等；completed/deleted 拒绝
  describe('drop [SP-STATE-4]', () => {
    it('active → HOLD，droppedAt 置位', () => {
      const state = makeState([makeTaskRow('t1', {}, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'drop', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(0)
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(field<string>(t, 'status')).toBe(EXPLICIT_STATUS.HOLD)
      expect(field<string>(t, 'droppedAt')).toBe(SYNC_NOW)
    })
    it('hold → noop（幂等）', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.HOLD, droppedAt: SYNC_NOW }, { syncId: 1 })])
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
    it('hold → ACTIVE，droppedAt 清空，syncId 推进', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.HOLD, droppedAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'restore', taskId: 't1' }))
      expect(res.response.applied).toContain('c1')
      expect(res.response.rejected).toHaveLength(0)
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(field<string>(t, 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
      expect(field(t, 'droppedAt')).toBeNull()
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
    it('向上级联：restore 子 → 链路 HOLD 祖先全转 ACTIVE（droppedAt 清）', () => {
      const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.HOLD, droppedAt: SYNC_NOW }, { syncId: 1 })
      const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.HOLD, droppedAt: SYNC_NOW }, { syncId: 2 })
      const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.HOLD, droppedAt: SYNC_NOW }, { syncId: 3 })
      const res = runCmd(makeState([gp, p, c]), makeCommand({ id: 'c1', type: 'restore', taskId: 'c' }))
      expect(res.response.rejected).toHaveLength(0)
      for (const id of ['c', 'p', 'gp']) {
        const t = findRow(res.state.rows, 'task', id)!
        expect(field<string>(t, 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
        expect(field(t, 'droppedAt')).toBeNull()
      }
    })
    it('向上级联不串扰 COMPLETED 祖先 [SP-LINK-STATE-6]', () => {
      const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 })
      const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.HOLD, droppedAt: SYNC_NOW }, { syncId: 2 })
      const res = runCmd(makeState([p, c]), makeCommand({ id: 'c1', type: 'restore', taskId: 'c' }))
      expect(res.response.rejected).toHaveLength(0)
      expect(field<string>(findRow(res.state.rows, 'task', 'p'), 'status')).toBe(EXPLICIT_STATUS.COMPLETED)
      expect(field<string>(findRow(res.state.rows, 'task', 'p'), 'completedAt')).toBe(SYNC_NOW)
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
    it('completed → 拒绝（仅 active 可删）', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'delete', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(1)
      expect(field<string>(findRow(res.state.rows, 'task', 't1'), 'status')).toBe(EXPLICIT_STATUS.COMPLETED)
    })
    it('hold → 拒绝（仅 active 可删）', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.HOLD, droppedAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'delete', taskId: 't1' }))
      expect(res.response.rejected).toHaveLength(1)
      expect(field<string>(findRow(res.state.rows, 'task', 't1'), 'status')).toBe(EXPLICIT_STATUS.HOLD)
    })
    it('deleted → noop（幂等 ack，状态不变）', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.DELETED, droppedAt: SYNC_NOW }, { syncId: 1 })])
      const res = runCmd(state, makeCommand({ id: 'c1', type: 'delete', taskId: 't1' }))
      expect(res.response.applied).toContain('c1')
      expect(res.response.rejected).toHaveLength(0)
      expect(findRow(res.state.rows, 'task', 't1')!.syncId).toBe(1)
    })
    it('向下级联：delete 父 → 所有非 DELETED 后代 DELETED（跨终态扫荡）', () => {
      const p = makeTaskRow('p', {}, { syncId: 1 })
      const c1 = makeTaskRow('c1', { parentId: 'p' }, { syncId: 2 })
      const c2 = makeTaskRow('c2', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW }, { syncId: 3 })
      const res = runCmd(makeState([p, c1, c2]), makeCommand({ id: 'd1', type: 'delete', taskId: 'p' }))
      expect(res.response.rejected).toHaveLength(0)
      for (const id of ['p', 'c1', 'c2']) {
        expect(field<string>(findRow(res.state.rows, 'task', id), 'status')).toBe(EXPLICIT_STATUS.DELETED)
        expect(field<string>(findRow(res.state.rows, 'task', id), 'droppedAt')).toBe(SYNC_NOW)
      }
    })
  })

  // SP-STATE-7: 已删除终态（无状态回退）—— domain status=DELETED 的 task 行不被 upsert 复活/改写
  describe('终态锁 [SP-STATE-7]', () => {
    it('status=DELETED 的 task 行：upsert 不复活、patch 不应用（终态不回退）', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.DELETED, droppedAt: SYNC_NOW }, { syncId: 1, deleted: true })])
      const res = runMut(state, makeMutation({ id: 'm1', entityId: 't1', patch: { name: '复活' } }))
      expect(res.response.applied).toContain('m1')
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(t.deleted).toBe(true) // 不复活
      expect(field<string>(t, 'status')).toBe(EXPLICIT_STATUS.DELETED)
      expect(field<string>(t, 'name')).toBe('task') // patch 未应用（保留默认名）
    })
    it('边界：sync 软删(status=ACTIVE, deleted=true) 仍走 LWW 复活（锁仅作用于 status=DELETED）', () => {
      const state = makeState([makeTaskRow('t1', {}, { syncId: 1, deleted: true })])
      const res = runMut(state, makeMutation({ id: 'm1', entityId: 't1', patch: { name: '复活' } }))
      const t = findRow(res.state.rows, 'task', 't1')!
      expect(t.deleted).toBe(false) // status=ACTIVE 非 DELETED，LWW 复活仍成立
      expect(field<string>(t, 'name')).toBe('复活')
    })
  })

  // SP-STATE-8: 已完成↔已取消无直连边；reopen/restore 均只回 ACTIVE，不可互换
  describe('completed↔hold 无直连 [SP-STATE-8]', () => {
    it('reopen on HOLD → 拒绝（completed↔hold 无直连，须先 restore）', () => {
      const state = makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.HOLD, droppedAt: SYNC_NOW }, { syncId: 1 })])
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
        makeState([makeTaskRow('t1', { status: EXPLICIT_STATUS.HOLD, droppedAt: SYNC_NOW }, { syncId: 1 })]),
        makeCommand({ id: 'c1', type: 'restore', taskId: 't1' }),
      )
      expect(field<string>(findRow(rs.state.rows, 'task', 't1'), 'status')).toBe(EXPLICIT_STATUS.ACTIVE)
      expect(field(rs.state.rows.find(r => r.id === 't1'), 'droppedAt')).toBeNull()
    })
  })
})
