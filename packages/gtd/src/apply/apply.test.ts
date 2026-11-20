import type { EntityRow, EntityRowOf } from '../data/row-schema'
import { describe, expect, it } from 'vitest'
import { repeatSuccessorId } from '../command/repeat'
import { EXPLICIT_STATUS } from '../data/types'
import { makeCommand, makeMutation, makeRepeatRule, makeTaskRow, makeTaskTagRow, SYNC_NOW } from '../fixtures'
import { applyIntents } from './apply'

function task(rows: EntityRow[], id: string): EntityRowOf<'task'> | undefined {
  return rows.find((r): r is EntityRowOf<'task'> => r.entity === 'task' && r.id === id)
}

function tag(rows: EntityRow[], id: string): EntityRowOf<'task_tag'> | undefined {
  return rows.find((r): r is EntityRowOf<'task_tag'> => r.entity === 'task_tag' && r.id === id)
}

describe('applyIntents：命令', () => {
  it('完成普通任务', () => {
    const rows: EntityRow[] = [makeTaskRow('t1')]
    const next = applyIntents(rows, { kind: 'command', command: makeCommand({ taskId: 't1' }) }, 'u1')
    expect(task(next, 't1')?.data).toMatchObject({
      status: EXPLICIT_STATUS.COMPLETED,
      completedAt: SYNC_NOW,
      heldAt: null,
      droppedAt: null,
    })
  })

  it('完成重复任务：后继 id 由规则与次数决定', () => {
    const rule = makeRepeatRule({ id: 'r1', cycle: 'daily', completedOccurrences: 2 })
    const rows: EntityRow[] = [makeTaskRow('t1', { repeatRuleId: 'r1', repeatRule: rule }), makeTaskTagRow('t1', 'g')]
    const next = applyIntents(rows, {
      kind: 'command',
      command: makeCommand({ taskId: 't1', clientGenerated: { nextTaskId: 'random' } }),
    }, 'u1')
    const successorId = repeatSuccessorId('r1', 3)
    expect(task(next, successorId)?.data.repeatedFromTaskId).toBe('t1')
    expect(tag(next, `${successorId}|g`)).toBeTruthy()
    expect(task(next, 't1')?.data.status).toBe(EXPLICIT_STATUS.COMPLETED)
    expect(task(next, 't1')?.data.repeatRule?.completedOccurrences).toBe(3)
  })

  it('在已完成的父下新建：新建任务并把父重开', () => {
    const rows: EntityRow[] = [makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED, completedAt: SYNC_NOW, groupType: 'parallel' })]
    const next = applyIntents(rows, {
      kind: 'command',
      command: makeCommand({ type: 'create_task', taskId: 'c', name: 'child', parentId: 'p', order: 0, mountDirId: null }),
    }, 'u1')
    expect(task(next, 'c')?.data.name).toBe('child')
    expect(task(next, 'p')?.data.status).toBe(EXPLICIT_STATUS.ACTIVE)
  })

  it('不修改传入的行', () => {
    const rule = makeRepeatRule({ id: 'r1', completedOccurrences: 0 })
    const rows: EntityRow[] = [makeTaskRow('t1', { repeatRuleId: 'r1', repeatRule: rule })]
    const before = structuredClone(rows)
    applyIntents(rows, { kind: 'command', command: makeCommand({ taskId: 't1' }) }, 'u1')
    expect(rows).toEqual(before)
  })

  it('非法命令抛错', () => {
    const rows: EntityRow[] = [makeTaskRow('p', { groupType: 'parallel' }), makeTaskRow('c', { parentId: 'p' })]
    const command = makeCommand({ type: 'move_task', taskId: 'p', parentId: 'c', order: 0 })
    expect(() => applyIntents(rows, { kind: 'command', command }, 'u1')).toThrow()
  })
})

describe('applyIntents：字段补丁', () => {
  it('改名字', () => {
    const rows: EntityRow[] = [makeTaskRow('t1', { name: 'old' })]
    const next = applyIntents(rows, { kind: 'mutation', mutation: makeMutation({ entityId: 't1', patch: { name: 'new' } }) }, 'u1')
    expect(task(next, 't1')?.data.name).toBe('new')
  })

  it('解绑标签后行被移除', () => {
    const rows: EntityRow[] = [makeTaskRow('t1'), makeTaskTagRow('t1', 'g')]
    const next = applyIntents(rows, {
      kind: 'mutation',
      mutation: makeMutation({ entity: 'task_tag', op: 'delete', entityId: 't1|g' }),
    }, 'u1')
    expect(tag(next, 't1|g')).toBeUndefined()
  })

  it('task 不能软删', () => {
    expect(() => applyIntents([makeTaskRow('t1')], {
      kind: 'mutation',
      mutation: makeMutation({ op: 'delete', entityId: 't1' }),
    }, 'u1')).toThrow(/purge/)
  })

  it('同一次操作里新建又删除的标签最终不存在', () => {
    const tagMut = makeMutation({ entity: 'task_tag', entityId: 't1|g', patch: { taskId: 't1', tagId: 'g' } })
    const untag = makeMutation({ entity: 'task_tag', entityId: 't1|g', op: 'delete' })
    const next = applyIntents([makeTaskRow('t1')], [
      { kind: 'mutation', mutation: tagMut },
      { kind: 'mutation', mutation: untag },
    ], 'u1')
    expect(tag(next, 't1|g')).toBeUndefined()
  })
})

describe('applyIntents：永久删除', () => {
  it('回收站里的任务可以 purge', () => {
    const rows: EntityRow[] = [makeTaskRow('t1', { status: EXPLICIT_STATUS.DELETED }), makeTaskTagRow('t1', 'g')]
    const next = applyIntents(rows, { kind: 'purge', taskId: 't1' }, 'u1')
    expect(task(next, 't1')).toBeUndefined()
    expect(tag(next, 't1|g')).toBeUndefined()
  })

  it('先移入回收站再 purge', () => {
    const rows: EntityRow[] = [makeTaskRow('t1')]
    const next = applyIntents(rows, [
      { kind: 'command', command: makeCommand({ type: 'delete', taskId: 't1' }) },
      { kind: 'purge', taskId: 't1' },
    ], 'u1')
    expect(next).toEqual([])
  })

  it('不在回收站的任务不能 purge', () => {
    expect(() => applyIntents([makeTaskRow('t1')], { kind: 'purge', taskId: 't1' }, 'u1'))
      .toThrow('不在回收站中，不能永久删除')
  })
})
