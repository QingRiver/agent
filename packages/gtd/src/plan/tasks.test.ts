import type { EntityRow, EntityRowOf } from '../data/row-schema'
import type { Op, OpIds } from '../op'
import { describe, expect, it } from 'vitest'
import { applyOps } from '../apply'
import { EXPLICIT_STATUS, GROUP_TYPE } from '../data/types'
import { makeTaskRow, makeTaskTagRow } from '../fixtures'
import { GtdModel } from '../state/model'
import { planSetTaskTagsOp } from './tags'
import {
  planAddChildTaskOp,
  planIndentTaskOp,
  planMoveTaskOp,
  planReorderTaskOp,
} from './tasks'

function stamp(): OpIds {
  let n = 0
  return {
    newId: () => `id-${++n}`,
    nowIso: () => '2026-01-01T00:00:00.000Z',
  }
}

/** 树 → plan → op[] → apply → 新树。 */
function act(rows: EntityRow[], plan: (model: GtdModel, ids: OpIds) => Op[]): EntityRow[] {
  const ops = plan(new GtdModel(rows), stamp())
  return applyOps(rows, ops, 'u1')
}

function task(rows: EntityRow[], id: string): EntityRowOf<'task'> | undefined {
  return rows.find((row): row is EntityRowOf<'task'> => row.entity === 'task' && row.id === id)
}

describe('planMoveTaskOp', () => {
  it('挂载和父节点都没变时树不变', () => {
    const t = makeTaskRow('t1', { mountDirId: 'p', parentId: null, order: 0 })
    expect(act([t], (model, ids) => planMoveTaskOp(model, 't1', { mountDirId: 'p' }, ids))).toEqual([t])
  })

  it('不能移进自己的子树', () => {
    const parent = makeTaskRow('p', { mountDirId: 'd', parentId: null, order: 0 })
    const child = makeTaskRow('c', { mountDirId: 'd', parentId: 'p', order: 0 })
    expect(() => act([parent, child], (model, ids) => planMoveTaskOp(model, 'p', {
      mountDirId: 'd',
      parentId: 'c',
    }, ids))).toThrow(/子树/)
  })

  it('换项目后挂载目录跟着变', () => {
    const t = makeTaskRow('t1', { mountDirId: 'a', parentId: null, order: 0 })
    const after = act([t], (model, ids) => planMoveTaskOp(model, 't1', { mountDirId: 'b', parentId: null }, ids))
    expect(task(after, 't1')?.data).toMatchObject({ mountDirId: 'b', parentId: null })
  })
})

describe('planIndentTaskOp', () => {
  it('缩进到前一个同级下面，并给新父补上分组', () => {
    const a = makeTaskRow('a', { mountDirId: 'd', parentId: null, order: 0, groupType: null })
    const b = makeTaskRow('b', { mountDirId: 'd', parentId: null, order: 1 })
    const after = act([a, b], (model, ids) => planIndentTaskOp(model, 'b', ids))
    expect(task(after, 'b')?.data.parentId).toBe('a')
    expect(task(after, 'a')?.data.groupType).toBe(GROUP_TYPE.PARALLEL)
  })
})

describe('planAddChildTaskOp', () => {
  it('非活跃父任务不能加子任务', () => {
    const p = makeTaskRow('p', {
      mountDirId: 'd',
      parentId: null,
      status: EXPLICIT_STATUS.COMPLETED,
      statusChangedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(() => act([p], (model, ids) => planAddChildTaskOp(model, 'p', 'child', ids))).toThrow(/非活跃/)
  })

  it('加上子任务，父任务变成并行分组', () => {
    const p = makeTaskRow('p', { mountDirId: 'd', parentId: null, order: 0, groupType: null })
    const after = act([p], (model, ids) => planAddChildTaskOp(model, 'p', '子任务', ids))
    const child = after.find((row): row is EntityRowOf<'task'> => row.entity === 'task' && row.id !== 'p')
    expect(child?.data).toMatchObject({ name: '子任务', parentId: 'p', mountDirId: 'd' })
    expect(task(after, 'p')?.data.groupType).toBe(GROUP_TYPE.PARALLEL)
  })
})

describe('planReorderTaskOp / planSetTaskTagsOp', () => {
  it('排到前一个同级之前', () => {
    const a = makeTaskRow('a', { mountDirId: 'd', parentId: null, order: 0 })
    const b = makeTaskRow('b', { mountDirId: 'd', parentId: null, order: 1 })
    const after = act([a, b], (model, ids) => planReorderTaskOp(model, 'b', { beforeId: null, afterId: 'a' }, ids))
    expect(task(after, 'b')!.data.order).toBeLessThan(task(after, 'a')!.data.order)
  })

  it('标签按差集增删', () => {
    const t = makeTaskRow('t1', {})
    const after = act(
      [t, makeTaskTagRow('t1', 'old')],
      (model, ids) => planSetTaskTagsOp(model, 't1', ['new'], ids),
    )
    expect(after.some(row => row.entity === 'task_tag' && row.id === 't1|new')).toBe(true)
    expect(after.some(row => row.entity === 'task_tag' && row.id === 't1|old')).toBe(false)
  })
})
