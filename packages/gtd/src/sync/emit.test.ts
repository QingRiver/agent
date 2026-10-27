import type { EntityRow } from '../data/sync-schema'
import type { CreateWrite, SetWrite, Write } from './txn'
import { describe, expect, it } from 'vitest'
import { repeatSuccessorId } from '../command/repeat'
import { EXPLICIT_STATUS, PLANNED_MODE } from '../data/types'
import { makeCommand, makeMutation, makeRepeatRule, makeTaskRow, makeTaskTagRow, SYNC_NOW } from '../fixtures'
import { emitWrites } from './emit'
import { WritesSchema } from './txn'

const sets = (writes: Write[]) => writes.filter((w): w is SetWrite => w.op === 'set')
const creates = (writes: Write[]) => writes.filter((w): w is CreateWrite => w.op === 'create')
const setOf = (writes: Write[], id: string) => sets(writes).find(w => w.id === id)

describe('emitWrites：命令', () => {
  it('完成普通任务：只写状态列整组', () => {
    const rows: EntityRow[] = [makeTaskRow('t1')]
    const writes = emitWrites(rows, { kind: 'command', command: makeCommand({ taskId: 't1' }) }, 'u1')
    expect(writes).toEqual([{
      op: 'set',
      entity: 'task',
      id: 't1',
      columns: { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW, heldAt: null, droppedAt: null },
    }])
  })

  it('完成重复任务：后继 id 由规则与次数决定，忽略调用方提议的 id', () => {
    const rule = makeRepeatRule({ id: 'r1', cycle: 'daily', completedOccurrences: 2 })
    const rows: EntityRow[] = [makeTaskRow('t1', { repeatRuleId: 'r1', repeatRule: rule }), makeTaskTagRow('t1', 'g')]
    const command = makeCommand({ taskId: 't1', clientGenerated: { nextTaskId: 'random' } })
    const writes = emitWrites(rows, { kind: 'command', command }, 'u1')

    const successorId = repeatSuccessorId('r1', 3)
    expect(creates(writes).map(w => `${w.entity}:${w.id}`).sort()).toEqual([`task:${successorId}`, `task_tag:${successorId}|g`])
    expect(creates(writes).find(w => w.entity === 'task')?.data.repeatedFromTaskId).toBe('t1')
    expect(setOf(writes, 't1')?.columns).toMatchObject({ status: EXPLICIT_STATUS.COMPLETED, repeatRuleId: 'r1' })
    expect((setOf(writes, 't1')?.columns.repeatRule as { completedOccurrences: number }).completedOccurrences).toBe(3)
  })

  it('在已完成的父下新建：新建任务并把父重开', () => {
    const rows: EntityRow[] = [makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW, groupType: 'parallel' })]
    const command = makeCommand({ type: 'create_task', taskId: 'c', name: 'child', parentId: 'p', order: 0, mountDirId: null })
    const writes = emitWrites(rows, { kind: 'command', command }, 'u1')
    expect(creates(writes).map(w => w.id)).toEqual(['c'])
    expect(setOf(writes, 'p')?.columns).toEqual({ status: EXPLICIT_STATUS.ACTIVE, completedAt: null, heldAt: null, droppedAt: null })
  })

  it('没有变化时返回空数组', () => {
    const rows: EntityRow[] = [makeTaskRow('t1', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW })]
    expect(emitWrites(rows, { kind: 'command', command: makeCommand({ taskId: 't1' }) }, 'u1')).toEqual([])
  })

  it('不修改传入的行', () => {
    const rule = makeRepeatRule({ id: 'r1', completedOccurrences: 0 })
    const rows: EntityRow[] = [makeTaskRow('t1', { repeatRuleId: 'r1', repeatRule: rule })]
    const before = structuredClone(rows)
    emitWrites(rows, { kind: 'command', command: makeCommand({ taskId: 't1' }) }, 'u1')
    expect(rows).toEqual(before)
  })

  it('非法命令抛错（例如移到自己的子孙下）', () => {
    const rows: EntityRow[] = [makeTaskRow('p', { groupType: 'parallel' }), makeTaskRow('c', { parentId: 'p' })]
    const command = makeCommand({ type: 'move_task', taskId: 'p', parentId: 'c', order: 0 })
    expect(() => emitWrites(rows, { kind: 'command', command }, 'u1')).toThrow()
  })
})

describe('emitWrites：字段补丁', () => {
  it('只写改动的列', () => {
    const rows: EntityRow[] = [makeTaskRow('t1', { name: 'old' })]
    const writes = emitWrites(rows, { kind: 'mutation', mutation: makeMutation({ entityId: 't1', patch: { name: 'new' } }) }, 'u1')
    expect(writes).toEqual([{ op: 'set', entity: 'task', id: 't1', columns: { name: 'new' } }])
  })

  it('只改 updatedAt 的补丁不产生写入', () => {
    const rows: EntityRow[] = [makeTaskRow('t1', { name: 'same' })]
    const mutation = makeMutation({ entityId: 't1', patch: { name: 'same', updatedAt: '2030-01-01T00:00:00.000Z' } })
    expect(emitWrites(rows, { kind: 'mutation', mutation }, 'u1')).toEqual([])
  })

  it('有实质修改时 updatedAt 随之写入', () => {
    const rows: EntityRow[] = [makeTaskRow('t1', { name: 'old' })]
    const mutation = makeMutation({ entityId: 't1', patch: { name: 'new', updatedAt: '2030-01-01T00:00:00.000Z' } })
    expect(setOf(emitWrites(rows, { kind: 'mutation', mutation }, 'u1'), 't1')?.columns)
      .toEqual({ name: 'new', updatedAt: '2030-01-01T00:00:00.000Z' })
  })

  it('改计划日时整组带上 plannedMode', () => {
    const rows: EntityRow[] = [makeTaskRow('t1', { plannedMode: PLANNED_MODE.ON, plannedDate: '2026-07-01T00:00:00.000Z' })]
    const mutation = makeMutation({ entityId: 't1', patch: { plannedDate: '2026-07-02T00:00:00.000Z' } })
    const writes = emitWrites(rows, { kind: 'mutation', mutation }, 'u1')
    expect(setOf(writes, 't1')?.columns).toEqual({ plannedMode: PLANNED_MODE.ON, plannedDate: '2026-07-02T00:00:00.000Z' })
  })

  it('解绑标签：task_tag 软删', () => {
    const rows: EntityRow[] = [makeTaskRow('t1'), makeTaskTagRow('t1', 'g')]
    const writes = emitWrites(rows, { kind: 'mutation', mutation: makeMutation({ entity: 'task_tag', op: 'delete', entityId: 't1|g' }) }, 'u1')
    expect(writes).toEqual([{ op: 'remove', entity: 'task_tag', id: 't1|g' }])
  })

  it('task 不能软删', () => {
    const rows: EntityRow[] = [makeTaskRow('t1')]
    expect(() => emitWrites(rows, { kind: 'mutation', mutation: makeMutation({ op: 'delete', entityId: 't1' }) }, 'u1'))
      .toThrow(/purge/)
  })
})

describe('emitWrites：一次操作多个意图', () => {
  it('依次执行、合并成一条事务的写入', () => {
    const rows: EntityRow[] = [makeTaskRow('p', { mountDirId: 'd', groupType: 'parallel' }), makeTaskTagRow('p', 'g')]
    const writes = emitWrites(rows, [
      { kind: 'command', command: makeCommand({ type: 'create_task', taskId: 'c', name: 'c', parentId: 'p', order: 0, mountDirId: 'd' }) },
      { kind: 'mutation', mutation: makeMutation({ entity: 'task_tag', entityId: 'c|g', patch: { taskId: 'c', tagId: 'g' } }) },
      { kind: 'mutation', mutation: makeMutation({ entityId: 'c', patch: { flagged: true } }) },
    ], 'u1')
    expect(writes.map(w => `${w.op}:${w.entity}:${w.id}`)).toEqual(['create:task:c', 'create:task_tag:c|g'])
    expect(creates(writes)[0]?.data.flagged).toBe(true)
  })

  it('后面的意图看得见前面意图的结果；任一失败则整体失败', () => {
    const rows: EntityRow[] = [makeTaskRow('t1')]
    expect(() => emitWrites(rows, [
      { kind: 'command', command: makeCommand({ taskId: 't1' }) },
      { kind: 'mutation', mutation: makeMutation({ entity: 'task_tag', entityId: 'x|g', patch: { taskId: 'x', tagId: 'g' } }) },
    ], 'u1')).toThrow('任务不存在')
  })
})

describe('emitWrites：字段补丁规则', () => {
  it('改推迟日晚于截止日时成对规范化', () => {
    const rows: EntityRow[] = [makeTaskRow('t1', { deferDate: null, dueDate: '2026-07-10T00:00:00.000Z' })]
    const writes = emitWrites(rows, { kind: 'mutation', mutation: makeMutation({ entityId: 't1', patch: { deferDate: '2026-07-20T00:00:00.000Z' } }) }, 'u1')
    const columns = setOf(writes, 't1')?.columns
    expect(columns?.deferDate).toBe('2026-07-20T00:00:00.000Z')
    expect(Object.hasOwn(columns ?? {}, 'dueDate')).toBe(true)
  })

  it('回收站里的任务不接受字段修改', () => {
    const rows: EntityRow[] = [makeTaskRow('t1', { status: EXPLICIT_STATUS.DELETED })]
    expect(emitWrites(rows, { kind: 'mutation', mutation: makeMutation({ entityId: 't1', patch: { name: 'x' } }) }, 'u1')).toEqual([])
  })

  it('task 补丁不能新建任务', () => {
    expect(() => emitWrites([], { kind: 'mutation', mutation: makeMutation({ entityId: 'nope', patch: { name: 'x' } }) }, 'u1'))
      .toThrow(/create_task/)
  })

  it('绑定标签到不存在的任务被拒绝', () => {
    expect(() => emitWrites([], { kind: 'mutation', mutation: makeMutation({ entity: 'task_tag', entityId: 'x|g', patch: { taskId: 'x', tagId: 'g' } }) }, 'u1'))
      .toThrow('任务不存在')
  })

  it('重新绑定已解绑的标签：解绑后行已不存在，重新 create', () => {
    const rows: EntityRow[] = [makeTaskRow('t1')]
    const writes = emitWrites(rows, { kind: 'mutation', mutation: makeMutation({ entity: 'task_tag', entityId: 't1|g', patch: { taskId: 't1', tagId: 'g' } }) }, 'u1')
    expect(writes).toEqual([{ op: 'create', entity: 'task_tag', id: 't1|g', data: { taskId: 't1', tagId: 'g' } }])
  })

  it('同一次操作里新建又删除的行不产生写入', () => {
    const tag = makeMutation({ entity: 'task_tag', entityId: 't1|g', patch: { taskId: 't1', tagId: 'g' } })
    const untag = makeMutation({ entity: 'task_tag', entityId: 't1|g', op: 'delete' })
    const writes = emitWrites([makeTaskRow('t1')], [{ kind: 'mutation', mutation: tag }, { kind: 'mutation', mutation: untag }], 'u1')
    expect(writes).toEqual([])
  })
})

describe('emitWrites：永久删除', () => {
  it('回收站里的任务可以 purge', () => {
    const rows: EntityRow[] = [makeTaskRow('t1', { status: EXPLICIT_STATUS.DELETED })]
    expect(emitWrites(rows, { kind: 'purge', taskId: 't1' }, 'u1')).toEqual([{ op: 'purge', entity: 'task', id: 't1' }])
  })

  it('先移入回收站再 purge 可以在同一次操作里完成，purge 排在最后', () => {
    const rows: EntityRow[] = [makeTaskRow('t1')]
    const writes = emitWrites(rows, [
      { kind: 'command', command: makeCommand({ type: 'delete', taskId: 't1' }) },
      { kind: 'purge', taskId: 't1' },
    ], 'u1')
    expect(writes).toEqual([{ op: 'purge', entity: 'task', id: 't1' }])
  })

  it('不在回收站的任务不能 purge', () => {
    const rows: EntityRow[] = [makeTaskRow('t1')]
    expect(() => emitWrites(rows, { kind: 'purge', taskId: 't1' }, 'u1')).toThrow('不在回收站中，不能永久删除')
  })
})

describe('emitWrites 的输出总是合法事务', () => {
  it('各种操作的写入都通过 WritesSchema', () => {
    const rule = makeRepeatRule({ id: 'r1' })
    const rows: EntityRow[] = [
      makeTaskRow('t1', { repeatRuleId: 'r1', repeatRule: rule }),
      makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW, groupType: 'parallel' }),
      makeTaskTagRow('t1', 'g'),
    ]
    const outputs = [
      emitWrites(rows, { kind: 'command', command: makeCommand({ taskId: 't1' }) }, 'u1'),
      emitWrites(rows, { kind: 'command', command: makeCommand({ type: 'drop', taskId: 't1' }) }, 'u1'),
      emitWrites(rows, { kind: 'command', command: makeCommand({ type: 'reopen', taskId: 'p' }) }, 'u1'),
      emitWrites(rows, { kind: 'command', command: makeCommand({ type: 'create_task', taskId: 'n', name: 'n', parentId: 'p', order: 1, mountDirId: null }) }, 'u1'),
      emitWrites(rows, { kind: 'mutation', mutation: makeMutation({ entityId: 't1', patch: { flagged: true } }) }, 'u1'),
    ]
    for (const writes of outputs)
      expect(WritesSchema.safeParse(writes).success).toBe(true)
  })
})
