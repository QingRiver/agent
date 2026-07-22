import type { GtdCommand, GtdMutation, SyncState } from '../sync'

import { describe, expect, it } from 'vitest'
import { parse, serialize } from '../serialize'
import { applyPush, pull } from '../sync'
import { TaskRowDataSchema } from '../sync-schema'
import { makeDoc, makeFolder, makeProject, makeRepeatRule, makeTag, makeTask } from './fixtures'
import {
  field,
  findRow,
  makeCommand,
  makeFolderRow,
  makeMutation,
  makeProjectRow,
  makeState,
  makeTagRow,
  makeTaskRow,
  makeTaskTagRow,
  SYNC_NOW,
} from './sync-fixtures'

/**
 * GTD 同步 push/pull 契约测试。
 *
 *  apply 语义核心：patch 列合并
 * （只写变更列，未提及列不动）；每实体 sync_id 仅服务增量拉取；同字段后写赢、
 * 不同字段并发各自保留。状态枚举复用本包 EXPLICIT_STATUS（与领域状态机闭环）。
 * fixtures 复用 ./fixtures 的 makeTask 等（Object.assign 覆盖 JSON），顺带在
 * 末节验证 serialize/parse round-trip 与 EntityRow.data 符合 TaskSchema。
 */

function push(
  state: SyncState,
  mutations: GtdMutation[] = [],
  commands: GtdCommand[] = [],
  lastSyncId = 0,
) {
  return applyPush(state, { mutations, commands, lastSyncId })
}

// ============================================================
// pull
// ============================================================

describe('pull', () => {
  it('lastSyncId=0 返回所有行（含软删行）', () => {
    const state = makeState([
      makeTaskRow('t1', {}, { syncId: 1 }),
      makeTaskRow('t2', {}, { syncId: 2, deleted: true }),
      makeTaskTagRow('t1', 'g1', { syncId: 3 }),
    ])
    const res = pull(state, 0)
    expect(res.changes.map(r => r.id).sort()).toEqual(['t1', 't1|g1', 't2'])
    expect(res.serverSyncId).toBe(3)
  })

  it('只返回 syncId > lastSyncId 的行', () => {
    const state = makeState([
      makeTaskRow('t1', {}, { syncId: 1 }),
      makeTaskRow('t2', {}, { syncId: 2 }),
      makeTaskRow('t3', {}, { syncId: 3 }),
    ])
    const res = pull(state, 1)
    expect(res.changes.map(r => r.id).sort()).toEqual(['t2', 't3'])
    expect(res.serverSyncId).toBe(3)
  })

  it('含软删行（deleted=true 也下发，供客户端删本地）', () => {
    const state = makeState([makeTaskRow('t1', {}, { syncId: 2, deleted: true })])
    const res = pull(state, 0)
    expect(res.changes).toHaveLength(1)
    expect(res.changes[0]?.deleted).toBe(true)
  })

  it('无变更时 changes 为空，serverSyncId 仍返回当前 clock', () => {
    const state = makeState([makeTaskRow('t1', {}, { syncId: 5 })])
    const res = pull(state, 5)
    expect(res.changes).toEqual([])
    expect(res.serverSyncId).toBe(5)
  })

  it('关联表行带 entity 判别字段，客户端可按行分发', () => {
    const state = makeState([
      makeTaskRow('t1', {}, { syncId: 1 }),
      makeTaskTagRow('t1', 'g1', { syncId: 2 }),
    ])
    const res = pull(state, 0)
    const entities = res.changes.map(r => r.entity)
    expect(entities).toContain('task')
    expect(entities).toContain('task_tag')
  })

  it('空库 pull 返回空 changes 与 serverSyncId=0', () => {
    const res = pull(makeState([]), 0)
    expect(res.changes).toEqual([])
    expect(res.serverSyncId).toBe(0)
  })
})

// ============================================================
// applyPush: patch 列合并（核心 apply 语义）
// ============================================================

describe('applyPush: patch 列合并', () => {
  it('单字段 patch 只写该列，未提及列不动', () => {
    const state = makeState([
      makeTaskRow('t1', { name: '旧名', flagged: false }, { syncId: 1 }),
    ])
    const { response, state: next } = push(state, [
      makeMutation({ id: 'm1', entityId: 't1', patch: { flagged: true } }),
    ])
    const task = findRow(next.rows, 'task', 't1')
    // name 未被 patch 提及 → 保留旧值
    expect(field<string>(task, 'name')).toBe('旧名')
    expect(field<boolean>(task, 'flagged')).toBe(true)
    expect(findRow(response.changes, 'task', 't1')).toBeDefined()
  })

  it('非重叠字段并发各自保留（A 改 name、B 改 flagged）', () => {
    const state = makeState([
      makeTaskRow('t1', { name: '旧名', flagged: false }, { syncId: 1 }),
    ])
    const { state: next } = push(state, [
      makeMutation({ id: 'm1', entityId: 't1', patch: { name: '新名' } }),
      makeMutation({ id: 'm2', entityId: 't1', patch: { flagged: true } }),
    ])
    const task = findRow(next.rows, 'task', 't1')
    expect(field<string>(task, 'name')).toBe('新名')
    expect(field<boolean>(task, 'flagged')).toBe(true)
  })

  it('同字段并发后写赢（A、B 都改 name）', () => {
    const state = makeState([makeTaskRow('t1', { name: '旧名' }, { syncId: 1 })])
    const { state: next } = push(state, [
      makeMutation({ id: 'm1', entityId: 't1', patch: { name: 'A 名' } }),
      makeMutation({ id: 'm2', entityId: 't1', patch: { name: 'B 名' } }),
    ])
    expect(field<string>(findRow(next.rows, 'task', 't1'), 'name')).toBe('B 名')
  })

  it('upsert 不存在 id → 新增行', () => {
    const state = makeState([])
    const { state: next } = push(state, [
      makeMutation({
        id: 'm1',
        entityId: 't1',
        patch: { name: '新任务', status: 'active', flagged: false, projectId: null },
      }),
    ])
    expect(findRow(next.rows, 'task', 't1')).toBeDefined()
    expect(field<string>(findRow(next.rows, 'task', 't1'), 'name')).toBe('新任务')
  })

  it('delete op 软删行（deleted=true，非物理删）', () => {
    const state = makeState([makeTaskRow('t1', {}, { syncId: 1 })])
    const { state: next } = push(state, [
      makeMutation({ id: 'm1', entityId: 't1', op: 'delete' }),
    ])
    expect(findRow(next.rows, 'task', 't1')?.deleted).toBe(true)
  })

  it('upsert 命中已软删行 → 清 deleted 复活（创建意图胜删除）', () => {
    const state = makeState([makeTaskRow('t1', { name: '旧名' }, { syncId: 1, deleted: true })])
    const { state: next } = push(state, [
      makeMutation({ id: 'm1', entityId: 't1', patch: { name: '新名' } }),
    ])
    const task = findRow(next.rows, 'task', 't1')
    expect(task?.deleted).toBe(false)
    expect(field<string>(task, 'name')).toBe('新名')
  })
})

// ============================================================
// applyPush: 幂等
// ============================================================

describe('applyPush: 幂等', () => {
  it('同 mutation.id 重发不重复分配 syncId、不重复写', () => {
    const state = makeState([makeTaskRow('t1', { flagged: false }, { syncId: 1 })])
    const r1 = push(state, [makeMutation({ id: 'm1', entityId: 't1', patch: { flagged: true } })])
    const clock1 = r1.state.clock
    const r2 = push(r1.state, [makeMutation({ id: 'm1', entityId: 't1', patch: { flagged: true } })])
    expect(r2.state.clock).toBe(clock1)
    expect(r2.response.changes.filter(r => r.id === 't1' && r.syncId > clock1)).toHaveLength(0)
  })

  it('同 command.id 重发 no-op', () => {
    const state = makeState([
      makeTaskRow('t1', { status: 'active', repeatRuleId: null }, { syncId: 1 }),
    ])
    const c = makeCommand({ id: 'c1', taskId: 't1' })
    const first = push(state, [], [c])
    const clock1 = first.state.clock
    const second = push(first.state, [], [c])
    expect(second.state.clock).toBe(clock1)
  })

  it('batch 内重复 id 第二条跳过', () => {
    const state = makeState([makeTaskRow('t1', { flagged: false }, { syncId: 1 })])
    const { state: next } = push(state, [
      makeMutation({ id: 'dup', entityId: 't1', patch: { flagged: true } }),
      makeMutation({ id: 'dup', entityId: 't1', patch: { flagged: false } }),
    ])
    expect(field<boolean>(findRow(next.rows, 'task', 't1'), 'flagged')).toBe(true)
  })
})

// ============================================================
// applyPush: command complete（含客户端乐观 ID）
// ============================================================

describe('applyPush: command complete', () => {
  it('complete 无 repeat: 旧 task 终态 completed，无新实例', () => {
    const state = makeState([
      makeTaskRow('t1', { status: 'active', repeatRuleId: null }, { syncId: 1 }),
    ])
    const { state: next } = push(state, [], [makeCommand({ id: 'c1', taskId: 't1' })])
    const task = findRow(next.rows, 'task', 't1')
    expect(field<string>(task, 'status')).toBe('completed')
    expect(field<string>(task, 'completedAt')).toBeDefined()
    expect(next.rows.filter(r => r.entity === 'task')).toHaveLength(1)
  })

  it('complete + repeat: 新实例 id = clientGenerated.nextTaskId', () => {
    const nextId = 't1-next'
    const state = makeState([
      makeTaskRow('t1', { status: 'active', repeatRuleId: 'r1', repeatRule: makeRepeatRule({ id: 'r1' }) }, { syncId: 1 }),
    ])
    const { state: next } = push(
      state,
      [],
      [makeCommand({ id: 'c1', taskId: 't1', clientGenerated: { nextTaskId: nextId } })],
    )
    expect(findRow(next.rows, 'task', nextId)).toBeDefined()
    expect(field<string>(findRow(next.rows, 'task', 't1'), 'status')).toBe('completed')
  })

  it('complete 同 command.id 重发 → 幂等 no-op（不产生第二实例）', () => {
    const nextId = 't1-next'
    const state = makeState([
      makeTaskRow('t1', { status: 'active', repeatRuleId: 'r1', repeatRule: makeRepeatRule({ id: 'r1' }) }, { syncId: 1 }),
    ])
    const c = makeCommand({ id: 'c1', taskId: 't1', clientGenerated: { nextTaskId: nextId } })
    const r1 = push(state, [], [c])
    const taskCount1 = r1.state.rows.filter(r => r.entity === 'task').length
    const r2 = push(r1.state, [], [c])
    expect(r2.state.rows.filter(r => r.entity === 'task').length).toBe(taskCount1)
    expect(r2.state.clock).toBe(r1.state.clock)
  })

  it('complete 已完成同源 → no-op', () => {
    const state = makeState([
      makeTaskRow('t1', { status: 'completed', completedAt: SYNC_NOW }, { syncId: 1 }),
    ])
    const { state: next } = push(state, [], [makeCommand({ id: 'c1', taskId: 't1' })])
    expect(field<string>(findRow(next.rows, 'task', 't1'), 'status')).toBe('completed')
    expect(next.clock).toBe(state.clock)
  })

  it('clientGenerated.nextTaskId 已被占用且同源 → 幂等 no-op', () => {
    const nextId = 't1-next'
    const state = makeState([
      makeTaskRow('t1', { status: 'completed', completedAt: SYNC_NOW, repeatRuleId: 'r1', repeatRule: makeRepeatRule({ id: 'r1' }) }, { syncId: 1 }),
      makeTaskRow(nextId, { status: 'active', repeatedFromTaskId: 't1' }, { syncId: 2 }),
    ])
    const { state: next } = push(
      state,
      [],
      [makeCommand({ id: 'c2', taskId: 't1', clientGenerated: { nextTaskId: nextId } })],
    )
    expect(next.rows.filter(r => r.entity === 'task')).toHaveLength(2)
    expect(next.clock).toBe(state.clock)
  })

  it('clientGenerated.nextTaskId 已被占用但不同源 → reject', () => {
    const nextId = 't-other'
    const state = makeState([
      makeTaskRow('t1', { status: 'active', repeatRuleId: 'r1', repeatRule: makeRepeatRule({ id: 'r1' }) }, { syncId: 1 }),
      makeTaskRow(nextId, { status: 'active', repeatedFromTaskId: 'tX' }, { syncId: 2 }),
    ])
    const { response, state: next } = push(
      state,
      [],
      [makeCommand({ id: 'c1', taskId: 't1', clientGenerated: { nextTaskId: nextId } })],
    )
    expect(response.rejected.map(r => r.id)).toContain('c1')
    expect(next.clock).toBe(state.clock)
  })

  it('双端离线 complete（不同 id/nextTaskId）→ 第二个 no-op，单实例', () => {
    const state = makeState([
      makeTaskRow('t1', { status: 'active', repeatRuleId: 'r1', repeatRule: makeRepeatRule({ id: 'r1' }) }, { syncId: 1 }),
    ])
    const r1 = push(state, [], [
      makeCommand({ id: 'cA', taskId: 't1', clientGenerated: { nextTaskId: 'tA-next' } }),
    ])
    const taskCount1 = r1.state.rows.filter(r => r.entity === 'task').length
    const r2 = push(r1.state, [], [
      makeCommand({ id: 'cB', taskId: 't1', clientGenerated: { nextTaskId: 'tB-next' } }),
    ])
    expect(r2.state.rows.filter(r => r.entity === 'task').length).toBe(taskCount1)
    expect(findRow(r2.state.rows, 'task', 'tB-next')).toBeUndefined()
  })

  it('nextTaskId 同源但已软删 → 重新克隆复活（不丢重复实例）', () => {
    const nextId = 't1-next'
    const state = makeState([
      makeTaskRow('t1', { status: 'active', repeatRuleId: 'r1', repeatRule: makeRepeatRule({ id: 'r1' }) }, { syncId: 1 }),
      makeTaskRow(nextId, { status: 'active', repeatedFromTaskId: 't1' }, { syncId: 2, deleted: true }),
    ])
    const { state: next } = push(state, [], [
      makeCommand({ id: 'c1', taskId: 't1', clientGenerated: { nextTaskId: nextId } }),
    ])
    const revived = findRow(next.rows, 'task', nextId)
    expect(revived?.deleted).toBe(false)
    expect(field<string>(revived, 'status')).toBe('active')
    expect(field<string>(revived, 'repeatedFromTaskId')).toBe('t1')
    expect(field<string>(findRow(next.rows, 'task', 't1'), 'status')).toBe('completed')
  })

  it('complete 非 active 终态（cancelled）→ reject', () => {
    const state = makeState([
      makeTaskRow('t1', { status: 'cancelled' }, { syncId: 1 }),
    ])
    const { response, state: next } = push(state, [], [makeCommand({ id: 'c1', taskId: 't1' })])
    expect(response.rejected.map(r => r.id)).toContain('c1')
    expect(next.clock).toBe(state.clock)
  })

  it('有 repeat 缺 clientGenerated.nextTaskId → reject（防静默断链）', () => {
    const state = makeState([
      makeTaskRow('t1', { status: 'active', repeatRuleId: 'r1', repeatRule: makeRepeatRule({ id: 'r1' }) }, { syncId: 1 }),
    ])
    const { response, state: next } = push(state, [], [makeCommand({ id: 'c1', taskId: 't1' })])
    expect(response.rejected.map(r => r.id)).toContain('c1')
    expect(next.clock).toBe(state.clock)
  })

  it('complete+repeat: completedOccurrences++ 且新实例日期按 anchor 推算', () => {
    const nextId = 't1-next'
    const state = makeState([
      makeTaskRow('t1', {
        status: 'active',
        repeatRuleId: 'r1',
        repeatRule: makeRepeatRule({ id: 'r1', cycle: 'daily', interval: 1, anchor: 'completion', completedOccurrences: 0 }),
      }, { syncId: 1 }),
    ])
    const { state: next } = push(state, [], [
      makeCommand({ id: 'c1', taskId: 't1', clientGenerated: { nextTaskId: nextId }, clientTs: '2026-07-17T09:00:00Z' }),
    ])
    // 旧任务 repeatRule.completedOccurrences 0 → 1
    const oldRule = field<{ completedOccurrences: number }>(findRow(next.rows, 'task', 't1'), 'repeatRule')
    expect(oldRule?.completedOccurrences).toBe(1)
    // 新实例 dueDate = now + 1 day（COMPLETION anchor, daily, interval=1）
    expect(field<string>(findRow(next.rows, 'task', nextId), 'dueDate')).toBe('2026-07-18T09:00:00.000Z')
  })

  it('complete+repeat: 复制旧实例 task_tag 到新实例', () => {
    const nextId = 't1-next'
    const state = makeState([
      makeTaskRow('t1', {
        status: 'active',
        repeatRuleId: 'r1',
        repeatRule: makeRepeatRule({ id: 'r1', cycle: 'daily', interval: 1, anchor: 'completion' }),
      }, { syncId: 1 }),
      makeTagRow('g1', {}, { syncId: 2 }),
      makeTaskTagRow('t1', 'g1', { syncId: 3 }),
    ])
    const { state: next } = push(state, [], [
      makeCommand({ id: 'c1', taskId: 't1', clientGenerated: { nextTaskId: nextId }, clientTs: '2026-07-17T09:00:00Z' }),
    ])
    const copied = findRow(next.rows, 'task_tag', `${nextId}|g1`)
    expect(copied).toBeDefined()
    expect(field<string>(copied, 'taskId')).toBe(nextId)
    expect(field<string>(copied, 'tagId')).toBe('g1')
  })

  it('complete+repeat 达 maxOccurrences → shouldStop 不克隆不++', () => {
    const nextId = 't1-next'
    const state = makeState([
      makeTaskRow('t1', {
        status: 'active',
        repeatRuleId: 'r1',
        repeatRule: makeRepeatRule({ id: 'r1', cycle: 'daily', interval: 1, anchor: 'completion', maxOccurrences: 1, completedOccurrences: 1 }),
      }, { syncId: 1 }),
    ])
    const { state: next } = push(state, [], [
      makeCommand({ id: 'c1', taskId: 't1', clientGenerated: { nextTaskId: nextId }, clientTs: '2026-07-17T09:00:00Z' }),
    ])
    // shouldStop（completedOccurrences >= maxOccurrences）→ 不克隆
    expect(findRow(next.rows, 'task', nextId)).toBeUndefined()
    // 计数不++（仍为 1）
    const oldRule = field<{ completedOccurrences: number }>(findRow(next.rows, 'task', 't1'), 'repeatRule')
    expect(oldRule?.completedOccurrences).toBe(1)
    // 旧任务仍 complete
    expect(field<string>(findRow(next.rows, 'task', 't1'), 'status')).toBe('completed')
  })
})

// ============================================================
// applyPush: rejected（批次失败语义）
// ============================================================

describe('applyPush: rejected', () => {
  it('mutation 引用不存在实体 → 该条 rejected，其余继续', () => {
    const state = makeState([makeTaskRow('t1', { flagged: false }, { syncId: 1 })])
    const { response, state: next } = push(state, [
      makeMutation({ id: 'm1', entity: 'task', entityId: 't2', patch: { projectId: 'p-nope' } }),
      makeMutation({ id: 'm2', entityId: 't1', patch: { flagged: true } }),
    ])
    expect(response.rejected.map(r => r.id)).toContain('m1')
    expect(field<boolean>(findRow(next.rows, 'task', 't1'), 'flagged')).toBe(true)
  })

  it('delete 不存在的 task_tag → rejected', () => {
    const state = makeState([])
    const { response } = push(state, [
      makeMutation({ id: 'm1', entity: 'task_tag', entityId: 't1|g1', op: 'delete' }),
    ])
    expect(response.rejected.map(r => r.id)).toContain('m1')
  })

  it('command invariant 违规 → rejected 且不分配 syncId', () => {
    const state = makeState([])
    const { response, state: next } = push(state, [], [
      makeCommand({ id: 'c1', taskId: 'nope' }),
    ])
    expect(response.rejected.map(r => r.id)).toContain('c1')
    expect(next.clock).toBe(state.clock)
  })

  it('command 违规不阻塞后续 mutation', () => {
    const state = makeState([makeTaskRow('t1', { flagged: false }, { syncId: 1 })])
    const { response, state: next } = push(
      state,
      [makeMutation({ id: 'm1', entityId: 't1', patch: { flagged: true } })],
      [makeCommand({ id: 'c1', taskId: 'nope' })],
    )
    expect(response.rejected.map(r => r.id)).toContain('c1')
    expect(field<boolean>(findRow(next.rows, 'task', 't1'), 'flagged')).toBe(true)
  })

  it('mutation 违规不分配 syncId（被拒条目不占版本号）', () => {
    const state = makeState([makeTaskRow('t1', { flagged: false }, { syncId: 1 })])
    const { state: next } = push(state, [
      makeMutation({ id: 'm1', entity: 'task', entityId: 't2', patch: { projectId: 'p-nope' } }),
    ])
    expect(next.clock).toBe(state.clock)
  })
})

// ============================================================
// applyPush: changes 返回
// ============================================================

describe('applyPush: changes 返回', () => {
  it('含本次刚 apply 的行', () => {
    const state = makeState([makeTaskRow('t1', { flagged: false }, { syncId: 1 })])
    const { response } = push(state, [
      makeMutation({ id: 'm1', entityId: 't1', patch: { flagged: true } }),
    ])
    expect(findRow(response.changes, 'task', 't1')).toBeDefined()
  })

  it('含 command 副作用行（complete 新实例、级联软删行）', () => {
    const nextId = 't1-next'
    const state = makeState([
      makeTaskRow('t1', { status: 'active', repeatRuleId: 'r1', repeatRule: makeRepeatRule({ id: 'r1' }) }, { syncId: 1 }),
    ])
    const { response } = push(state, [], [
      makeCommand({ id: 'c1', taskId: 't1', clientGenerated: { nextTaskId: nextId } }),
    ])
    expect(findRow(response.changes, 'task', nextId)).toBeDefined()
    expect(findRow(response.changes, 'task', 't1')).toBeDefined()
  })

  it('changes 行带 entity 判别字段', () => {
    const state = makeState([
      makeTaskRow('t1', {}, { syncId: 1 }),
      makeTagRow('g1', {}, { syncId: 2 }),
    ])
    const { response } = push(state, [
      makeMutation({ id: 'm1', entity: 'task_tag', entityId: 't1|g1', patch: { taskId: 't1', tagId: 'g1' } }),
    ])
    expect(response.changes.every(r => typeof r.entity === 'string')).toBe(true)
    expect(response.changes.some(r => r.entity === 'task_tag')).toBe(true)
  })

  it('changes 行 syncId 递增且 > lastSyncId', () => {
    const state = makeState([makeTaskRow('t1', { flagged: false }, { syncId: 1 })])
    const { response } = push(
      state,
      [makeMutation({ id: 'm1', entityId: 't1', patch: { flagged: true } })],
      [],
      1,
    )
    expect(response.changes.every(r => r.syncId > 1)).toBe(true)
    expect(response.serverSyncId).toBeGreaterThan(1)
  })
})

// ============================================================
// applyPush: 级联软删（副作用行各推进 sync_id）
// ============================================================

describe('applyPush: 级联软删', () => {
  it('delete_folder: folder 软删 + 其下 project folderId 置 null（各推进 syncId 进 changes）', () => {
    const state = makeState([
      makeFolderRow('f1', {}, { syncId: 1 }),
      makeProjectRow('p1', { folderId: 'f1' }, { syncId: 2 }),
      makeProjectRow('p2', { folderId: 'f1' }, { syncId: 3 }),
    ])
    const { response, state: next } = push(state, [], [
      makeCommand({ id: 'c1', type: 'delete_folder', payload: { folderId: 'f1' } }),
    ])
    expect(findRow(next.rows, 'folder', 'f1')?.deleted).toBe(true)
    const p1 = findRow(next.rows, 'project', 'p1')
    const p2 = findRow(next.rows, 'project', 'p2')
    expect(field<string>(p1, 'folderId')).toBeNull()
    expect(field<string>(p2, 'folderId')).toBeNull()
    expect(p1?.syncId).toBeGreaterThan(2)
    expect(p2?.syncId).toBeGreaterThan(3)
    expect(findRow(response.changes, 'project', 'p1')).toBeDefined()
    expect(findRow(response.changes, 'project', 'p2')).toBeDefined()
  })

  it('delete_project: project 软删 + 子 task 递归软删进 changes', () => {
    const state = makeState([
      makeProjectRow('p1', {}, { syncId: 1 }),
      makeTaskRow('t1', { projectId: 'p1' }, { syncId: 2 }),
      makeTaskRow('t2', { projectId: 'p1', parentId: 't1' }, { syncId: 3 }),
    ])
    const { response, state: next } = push(state, [], [
      makeCommand({ id: 'c1', type: 'delete_project', payload: { projectId: 'p1' } }),
    ])
    expect(findRow(next.rows, 'project', 'p1')?.deleted).toBe(true)
    expect(findRow(next.rows, 'task', 't1')?.deleted).toBe(true)
    expect(findRow(next.rows, 'task', 't2')?.deleted).toBe(true)
    expect(findRow(response.changes, 'task', 't1')?.deleted).toBe(true)
    expect(findRow(response.changes, 'task', 't2')?.deleted).toBe(true)
  })

  it('delete_tag: tag 软删 + 关联 task_tag 行软删', () => {
    const state = makeState([
      makeTagRow('g1', {}, { syncId: 1 }),
      makeTaskTagRow('t1', 'g1', { syncId: 2 }),
      makeTaskTagRow('t2', 'g1', { syncId: 3 }),
    ])
    const { response, state: next } = push(state, [], [
      makeCommand({ id: 'c1', type: 'delete_tag', payload: { tagId: 'g1' } }),
    ])
    expect(findRow(next.rows, 'tag', 'g1')?.deleted).toBe(true)
    expect(findRow(next.rows, 'task_tag', 't1|g1')?.deleted).toBe(true)
    expect(findRow(next.rows, 'task_tag', 't2|g1')?.deleted).toBe(true)
    expect(findRow(response.changes, 'task_tag', 't1|g1')).toBeDefined()
    expect(findRow(response.changes, 'task_tag', 't2|g1')).toBeDefined()
  })
})

// ============================================================
// applyPush: 关联表独立版本（不污染父 task sync_id）
// ============================================================

describe('applyPush: 关联表独立版本', () => {
  it('task_tag upsert 不推进父 task 的 syncId', () => {
    const state = makeState([
      makeTaskRow('t1', { name: '名' }, { syncId: 1 }),
      makeTagRow('g1', {}, { syncId: 2 }),
    ])
    const { state: next } = push(state, [
      makeMutation({
        id: 'm1',
        entity: 'task_tag',
        entityId: 't1|g1',
        patch: { taskId: 't1', tagId: 'g1' },
      }),
    ])
    expect(findRow(next.rows, 'task', 't1')?.syncId).toBe(1)
    const tt = findRow(next.rows, 'task_tag', 't1|g1')
    expect(tt).toBeDefined()
    expect(tt?.syncId).toBeGreaterThan(1)
  })

  it('task_tag delete 软删关联行', () => {
    const state = makeState([
      makeTaskRow('t1', {}, { syncId: 1 }),
      makeTaskTagRow('t1', 'g1', { syncId: 2 }),
    ])
    const { state: next } = push(state, [
      makeMutation({ id: 'm1', entity: 'task_tag', entityId: 't1|g1', op: 'delete' }),
    ])
    expect(findRow(next.rows, 'task_tag', 't1|g1')?.deleted).toBe(true)
    expect(findRow(next.rows, 'task', 't1')?.syncId).toBe(1)
  })

  it('改 task.name 同时加 task_tag → name 保留，task syncId 只被 name 推进', () => {
    const state = makeState([
      makeTaskRow('t1', { name: '旧名' }, { syncId: 1 }),
      makeTagRow('g1', {}, { syncId: 2 }),
    ])
    const { state: next } = push(state, [
      makeMutation({ id: 'm1', entityId: 't1', patch: { name: '新名' } }),
      makeMutation({
        id: 'm2',
        entity: 'task_tag',
        entityId: 't1|g1',
        patch: { taskId: 't1', tagId: 'g1' },
      }),
    ])
    const task = findRow(next.rows, 'task', 't1')
    expect(field<string>(task, 'name')).toBe('新名')
    expect(task?.syncId).toBeGreaterThan(1)
    const tagRow = findRow(next.rows, 'task_tag', 't1|g1')
    expect(tagRow?.syncId).not.toBe(task?.syncId)
  })
})

// ============================================================
// applyPush: syncId 单调
// ============================================================

describe('applyPush: syncId 单调', () => {
  it('连续 push syncId 递增', () => {
    const state = makeState([makeTaskRow('t1', { flagged: false }, { syncId: 1 })])
    const r1 = push(state, [makeMutation({ id: 'm1', entityId: 't1', patch: { flagged: true } })])
    const r2 = push(r1.state, [makeMutation({ id: 'm2', entityId: 't1', patch: { flagged: false } })])
    expect(findRow(r2.state.rows, 'task', 't1')?.syncId).toBeGreaterThan(1)
    expect(r2.state.clock).toBeGreaterThan(r1.state.clock)
  })

  it('batch 内多 mutation 各拿递增 syncId', () => {
    const state = makeState([
      makeTaskRow('t1', { flagged: false }, { syncId: 1 }),
      makeTaskRow('t2', { flagged: false }, { syncId: 2 }),
    ])
    const { state: next } = push(state, [
      makeMutation({ id: 'm1', entityId: 't1', patch: { flagged: true } }),
      makeMutation({ id: 'm2', entityId: 't2', patch: { flagged: true } }),
    ])
    const s1 = findRow(next.rows, 'task', 't1')?.syncId
    const s2 = findRow(next.rows, 'task', 't2')?.syncId
    expect(s1).toBeDefined()
    expect(s2).toBeDefined()
    expect(s1).not.toBe(s2)
  })
})

// ============================================================
// fixtures: JSON 导入导出 round-trip（顺便测 serialize/parse + 行 data 符合 schema）
// ============================================================

describe('fixtures: JSON 导入导出 round-trip', () => {
  it('makeDoc 含各实体 serialize → parse 等于原文档', () => {
    const doc = makeDoc({
      folders: [makeFolder({ id: 'f1' })],
      projects: [makeProject({ id: 'p1', folderId: 'f1' })],
      tags: [makeTag({ id: 'g1' })],
      tasks: [makeTask({ id: 't1', projectId: 'p1', tagIds: ['g1'] })],
    })
    expect(parse(serialize(doc))).toEqual(doc)
  })

  it('syncRow.data 符合 TaskRowDataSchema（行 data 无 tagIds/attachmentIds，repeatRule 内联）', () => {
    const row = makeTaskRow('t1', { status: 'completed', repeatRuleId: 'r1', repeatRule: makeRepeatRule({ id: 'r1' }) })
    expect(() => TaskRowDataSchema.parse(row.data)).not.toThrow()
    expect(field<string>(row, 'status')).toBe('completed')
    expect(field<string>(row, 'repeatRuleId')).toBe('r1')
    // 行 data 不含 tagIds/attachmentIds（走 task_tag/attachment 行）
    expect(field(row, 'tagIds')).toBeUndefined()
    expect(field(row, 'attachmentIds')).toBeUndefined()
  })
})
