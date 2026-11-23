import type { EntityRow } from '../../data/row-schema'
import { describe, expect, it } from 'vitest'
import { GtdReader } from '../../data/reader'
import { EXPLICIT_STATUS, GROUP_TYPE } from '../../data/types'
import { makeTaskRow } from '../../fixtures/factories'
import { planSetTaskTagsOp } from './tags'
import {
  planAddChildTaskOp,
  planIndentTaskOp,
  planMoveTaskOp,
  planReorderTaskOp,
} from './tasks'

const IDS = {
  newId: (() => {
    let n = 0
    return () => `id-${++n}`
  })(),
  nowIso: () => '2026-01-01T00:00:00.000Z',
}

function reader(rows: EntityRow[]): GtdReader {
  return new GtdReader(rows)
}

describe('planMoveTaskOp', () => {
  it('noop when mount/parent unchanged and no before/after', () => {
    const t = makeTaskRow('t1', { mountDirId: 'p', parentId: null, order: 0 })
    expect(planMoveTaskOp(reader([t]), 't1', { mountDirId: 'p' }, IDS)).toEqual([])
  })

  it('rejects move into own subtree', () => {
    const parent = makeTaskRow('p', { mountDirId: 'd', parentId: null, order: 0 })
    const child = makeTaskRow('c', { mountDirId: 'd', parentId: 'p', order: 0 })
    expect(() => planMoveTaskOp(reader([parent, child]), 'p', {
      mountDirId: 'd',
      parentId: 'c',
    }, IDS)).toThrow(/子树/)
  })

  it('emits move_task + mount upsert', () => {
    const t = makeTaskRow('t1', { mountDirId: 'a', parentId: null, order: 0 })
    const intents = planMoveTaskOp(reader([t]), 't1', { mountDirId: 'b', parentId: null }, IDS)
    expect(intents[0]).toMatchObject({ kind: 'command', command: { type: 'move_task', taskId: 't1' } })
    expect(intents[1]).toMatchObject({
      kind: 'mutation',
      mutation: { entity: 'task', entityId: 't1', op: 'upsert', patch: { mountDirId: 'b' } },
    })
  })
})

describe('planIndentTaskOp', () => {
  it('moves under previous sibling and may set groupType', () => {
    const a = makeTaskRow('a', { mountDirId: 'd', parentId: null, order: 0, groupType: null })
    const b = makeTaskRow('b', { mountDirId: 'd', parentId: null, order: 1 })
    const intents = planIndentTaskOp(reader([a, b]), 'b', IDS)
    expect(intents[0]).toMatchObject({
      kind: 'command',
      command: { type: 'move_task', taskId: 'b', parentId: 'a' },
    })
    expect(intents.some(i =>
      i.kind === 'mutation'
      && i.mutation.entity === 'task'
      && i.mutation.entityId === 'a'
      && (i.mutation as { patch?: { groupType?: string } }).patch?.groupType === GROUP_TYPE.PARALLEL,
    )).toBe(true)
  })
})

describe('planAddChildTaskOp', () => {
  it('rejects inactive parent', () => {
    const p = makeTaskRow('p', {
      mountDirId: 'd',
      parentId: null,
      status: EXPLICIT_STATUS.COMPLETED,
      completedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(() => planAddChildTaskOp(reader([p]), 'p', 'child', IDS)).toThrow(/非活跃/)
  })
})

describe('planReorderTaskOp / planSetTaskTagsOp', () => {
  it('reorder emits order upsert', () => {
    const a = makeTaskRow('a', { mountDirId: 'd', parentId: null, order: 0 })
    const b = makeTaskRow('b', { mountDirId: 'd', parentId: null, order: 1 })
    const intents = planReorderTaskOp(reader([a, b]), 'b', { beforeId: null, afterId: 'a' }, IDS)
    expect(intents[0]).toMatchObject({
      kind: 'mutation',
      mutation: { entity: 'task', entityId: 'b', op: 'upsert' },
    })
  })

  it('set tags diffs add/remove', () => {
    const t = makeTaskRow('t1', {})
    const tagRow: EntityRow = {
      entity: 'task_tag',
      id: 't1|old',
      userId: 'u',
      syncId: 0,
      deleted: false,
      data: { taskId: 't1', tagId: 'old' },
    }
    const intents = planSetTaskTagsOp(reader([t, tagRow]), 't1', ['new'], IDS)
    expect(intents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'mutation',
        mutation: expect.objectContaining({ entity: 'task_tag', entityId: 't1|new', op: 'upsert' }),
      }),
      expect.objectContaining({
        kind: 'mutation',
        mutation: expect.objectContaining({ entity: 'task_tag', entityId: 't1|old', op: 'delete' }),
      }),
    ]))
  })
})
