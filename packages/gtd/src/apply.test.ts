import type { EntityRow, EntityRowOf } from './data/row-schema'
import type { Op } from './op'
import { describe, expect, it } from 'vitest'
import { applyOps } from './apply'
import { EXPLICIT_STATUS } from './data/types'
import { makeCreate, makeDelete, makeMove, makePatch, makeRepeatRule, makeTaskRow, makeTaskTagRow, makeTransition, SYNC_NOW } from './fixtures'
import { repeatSuccessorId } from './repeat'

function task(rows: EntityRow[], id: string): EntityRowOf<'task'> | undefined {
  return rows.find((r): r is EntityRowOf<'task'> => r.entity === 'task' && r.id === id)
}

function tag(rows: EntityRow[], id: string): EntityRowOf<'task_tag'> | undefined {
  return rows.find((r): r is EntityRowOf<'task_tag'> => r.entity === 'task_tag' && r.id === id)
}

function apply(rows: EntityRow[], ops: Op | readonly Op[]): EntityRow[] {
  return applyOps(rows, Array.isArray(ops) ? ops : [ops], 'u1')
}

describe('applyOps：状态与建点', () => {
  it('完成普通任务', () => {
    const rows: EntityRow[] = [makeTaskRow('t1')]
    const next = apply(rows, makeTransition({ taskId: 't1' }))
    expect(task(next, 't1')?.data).toMatchObject({
      status: EXPLICIT_STATUS.COMPLETED,
      statusChangedAt: SYNC_NOW,
    })
  })

  it('完成重复任务：后继 id 由规则与次数决定', () => {
    const rule = makeRepeatRule({ id: 'r1', cycle: 'daily', completedOccurrences: 2 })
    const rows: EntityRow[] = [makeTaskRow('t1', { repeatRuleId: 'r1', repeatRule: rule }), makeTaskTagRow('t1', 'g')]
    const next = apply(rows, makeTransition({ taskId: 't1' }))
    const successorId = repeatSuccessorId('r1', 3)
    expect(task(next, successorId)?.data.repeatedFromTaskId).toBe('t1')
    expect(tag(next, `${successorId}|g`)).toBeTruthy()
    expect(task(next, 't1')?.data.status).toBe(EXPLICIT_STATUS.COMPLETED)
    expect(task(next, 't1')?.data.repeatRule?.completedOccurrences).toBe(3)
  })

  it('在已完成的父下新建：新建任务并把父重开', () => {
    const rows: EntityRow[] = [makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED, statusChangedAt: SYNC_NOW, groupType: 'parallel' })]
    const next = apply(rows, makeCreate({ taskId: 'c', name: 'child', parentId: 'p', order: 0, mountDirId: null }))
    expect(task(next, 'c')?.data.name).toBe('child')
    expect(task(next, 'p')?.data.status).toBe(EXPLICIT_STATUS.ACTIVE)
  })

  it('不修改传入的行', () => {
    const rule = makeRepeatRule({ id: 'r1', completedOccurrences: 0 })
    const rows: EntityRow[] = [makeTaskRow('t1', { repeatRuleId: 'r1', repeatRule: rule })]
    const before = structuredClone(rows)
    apply(rows, makeTransition({ taskId: 't1' }))
    expect(rows).toEqual(before)
  })

  it('非法移动抛错', () => {
    const rows: EntityRow[] = [makeTaskRow('p', { groupType: 'parallel' }), makeTaskRow('c', { parentId: 'p' })]
    const op = makeMove({ taskId: 'p', parentId: 'c', order: 0 })
    expect(() => apply(rows, op)).toThrow()
  })
})

describe('applyOps：字段补丁', () => {
  it('改名字', () => {
    const rows: EntityRow[] = [makeTaskRow('t1', { name: 'old' })]
    const next = apply(rows, makePatch({ entityId: 't1', patch: { name: 'new' } }))
    expect(task(next, 't1')?.data.name).toBe('new')
  })

  it('解绑标签后行被移除', () => {
    const rows: EntityRow[] = [makeTaskRow('t1'), makeTaskTagRow('t1', 'g')]
    const next = apply(rows, makeDelete({ entity: 'task_tag', entityId: 't1|g' }))
    expect(tag(next, 't1|g')).toBeUndefined()
  })

  it('task 不能软删', () => {
    expect(() => apply([makeTaskRow('t1')], makeDelete({ entityId: 't1' }))).toThrow(/purge/)
  })

  it('同一次操作里新建又删除的标签最终不存在', () => {
    const tagMut = makePatch({ entity: 'task_tag', entityId: 't1|g', patch: { taskId: 't1', tagId: 'g' } })
    const untag = makeDelete({ entity: 'task_tag', entityId: 't1|g' })
    const next = apply([makeTaskRow('t1')], [tagMut, untag])
    expect(tag(next, 't1|g')).toBeUndefined()
  })
})

describe('applyOps：永久删除', () => {
  it('回收站里的任务可以 purge', () => {
    const rows: EntityRow[] = [makeTaskRow('t1', { status: EXPLICIT_STATUS.DELETED }), makeTaskTagRow('t1', 'g')]
    const next = apply(rows, { kind: 'purge', taskId: 't1' })
    expect(task(next, 't1')).toBeUndefined()
    expect(tag(next, 't1|g')).toBeUndefined()
  })

  it('先移入回收站再 purge', () => {
    const rows: EntityRow[] = [makeTaskRow('t1')]
    const next = apply(rows, [
      makeTransition({ action: 'delete', taskId: 't1' }),
      { kind: 'purge', taskId: 't1' },
    ])
    expect(next).toEqual([])
  })

  it('不在回收站的任务不能 purge', () => {
    expect(() => apply([makeTaskRow('t1')], { kind: 'purge', taskId: 't1' }))
      .toThrow('不在回收站中，不能永久删除')
  })
})
