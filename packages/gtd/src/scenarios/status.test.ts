/**
 * wiki/GTD.md「状态联动」场景表，以及完成 / 搁置 / 回收站的写路径。
 */
import { describe, expect, it } from 'vitest'
import { EXPLICIT_STATUS } from '../data/types'
import { makeTaskRow, SYNC_NOW } from '../fixtures'
import { planStatusOp } from '../plan/tasks'
import { act, read } from './run'

const { ACTIVE, COMPLETED, HOLD, DELETED } = EXPLICIT_STATUS

describe('状态联动', () => {
  it('1 双活跃', () => {
    const rows = [
      makeTaskRow('p', { mountDirId: 'd', groupType: 'parallel' }),
      makeTaskRow('c', { parentId: 'p', mountDirId: 'd' }),
    ]
    const view = read(rows)
    expect(view.physical('p')).toBe(ACTIVE)
    expect(view.status('p')).toBe(ACTIVE)
    expect(view.physical('c')).toBe(ACTIVE)
    expect(view.status('c')).toBe(ACTIVE)
  })

  it('2 完成父：子物理仍活跃，有效状态跟随完成', () => {
    const rows = [
      makeTaskRow('p', { mountDirId: 'd', groupType: 'parallel' }),
      makeTaskRow('c', { parentId: 'p', mountDirId: 'd' }),
    ]
    const after = act(rows, (model, ids) => planStatusOp(model, 'complete', 'p', ids))
    const view = read(after)
    expect(view.physical('p')).toBe(COMPLETED)
    expect(view.physical('c')).toBe(ACTIVE)
    expect(view.status('c')).toBe(COMPLETED)
  })

  it('3 重开子把已完成的父拉回活跃', () => {
    const rows = [
      makeTaskRow('p', { status: COMPLETED, statusChangedAt: SYNC_NOW, mountDirId: 'd', groupType: 'parallel' }),
      makeTaskRow('c', { parentId: 'p', status: COMPLETED, statusChangedAt: SYNC_NOW, mountDirId: 'd' }),
    ]
    const after = act(rows, (model, ids) => planStatusOp(model, 'reopen', 'c', ids))
    const view = read(after)
    expect(view.physical('p')).toBe(ACTIVE)
    expect(view.physical('c')).toBe(ACTIVE)
    expect(view.status('c')).toBe(ACTIVE)
  })

  it('4 子先完成不自动完成父', () => {
    const rows = [
      makeTaskRow('p', { mountDirId: 'd', groupType: 'parallel' }),
      makeTaskRow('c', { parentId: 'p', mountDirId: 'd' }),
    ]
    const after = act(rows, (model, ids) => planStatusOp(model, 'complete', 'c', ids))
    const view = read(after)
    expect(view.physical('p')).toBe(ACTIVE)
    expect(view.status('p')).toBe(ACTIVE)
    expect(view.physical('c')).toBe(COMPLETED)
    expect(view.status('c')).toBe(COMPLETED)
  })

  it('5 整树已完成', () => {
    const rows = [
      makeTaskRow('p', { status: COMPLETED, statusChangedAt: SYNC_NOW, mountDirId: 'd', groupType: 'parallel' }),
      makeTaskRow('c', { parentId: 'p', status: COMPLETED, statusChangedAt: SYNC_NOW, mountDirId: 'd' }),
    ]
    const view = read(rows)
    expect(view.status('p')).toBe(COMPLETED)
    expect(view.status('c')).toBe(COMPLETED)
  })

  it('6 搁置父：子有效跟随搁置，自身状态保留', () => {
    const rows = [
      makeTaskRow('p', { mountDirId: 'd', groupType: 'parallel' }),
      makeTaskRow('c', { parentId: 'p', status: COMPLETED, statusChangedAt: SYNC_NOW, mountDirId: 'd' }),
    ]
    const after = act(rows, (model, ids) => planStatusOp(model, 'drop', 'p', ids))
    const view = read(after)
    expect(view.physical('p')).toBe(HOLD)
    expect(view.physical('c')).toBe(COMPLETED)
    expect(view.status('c')).toBe(HOLD)
  })

  it('7 搁置父后继续：子按自身已完成生效', () => {
    const rows = [
      makeTaskRow('p', { status: HOLD, statusChangedAt: SYNC_NOW, mountDirId: 'd', groupType: 'parallel' }),
      makeTaskRow('c', { parentId: 'p', status: COMPLETED, statusChangedAt: SYNC_NOW, mountDirId: 'd' }),
    ]
    const after = act(rows, (model, ids) => planStatusOp(model, 'restore', 'p', ids))
    const view = read(after)
    expect(view.physical('p')).toBe(ACTIVE)
    expect(view.status('p')).toBe(ACTIVE)
    expect(view.physical('c')).toBe(COMPLETED)
    expect(view.status('c')).toBe(COMPLETED)
  })

  it('8 子全搁置时父仍可完成', () => {
    const rows = [
      makeTaskRow('p', { mountDirId: 'd', groupType: 'parallel' }),
      makeTaskRow('c', { parentId: 'p', status: HOLD, statusChangedAt: SYNC_NOW, mountDirId: 'd' }),
    ]
    const after = act(rows, (model, ids) => planStatusOp(model, 'complete', 'p', ids))
    const view = read(after)
    expect(view.physical('p')).toBe(COMPLETED)
    expect(view.physical('c')).toBe(HOLD)
    expect(view.status('c')).toBe(COMPLETED)
  })

  it('9 删除父：子有效进回收站，自身状态保留', () => {
    const rows = [
      makeTaskRow('p', { mountDirId: 'd', groupType: 'parallel' }),
      makeTaskRow('c', { parentId: 'p', mountDirId: 'd' }),
    ]
    const after = act(rows, (model, ids) => planStatusOp(model, 'delete', 'p', ids))
    const view = read(after)
    expect(view.physical('p')).toBe(DELETED)
    expect(view.physical('c')).toBe(ACTIVE)
    expect(view.status('c')).toBe(DELETED)
  })

  it('10 子独自在回收站，父保持活跃', () => {
    const rows = [
      makeTaskRow('p', { mountDirId: 'd', groupType: 'parallel' }),
      makeTaskRow('c', { parentId: 'p', mountDirId: 'd' }),
    ]
    const after = act(rows, (model, ids) => planStatusOp(model, 'delete', 'c', ids))
    const view = read(after)
    expect(view.physical('p')).toBe(ACTIVE)
    expect(view.status('p')).toBe(ACTIVE)
    expect(view.physical('c')).toBe(DELETED)
    expect(view.status('c')).toBe(DELETED)
  })

  it('三层：完成根之后，中间搁置不再决定孙子的有效状态', () => {
    const rows = [
      makeTaskRow('p', { mountDirId: 'd', groupType: 'parallel' }),
      makeTaskRow('c1', { parentId: 'p', status: HOLD, statusChangedAt: SYNC_NOW, mountDirId: 'd', groupType: 'parallel' }),
      makeTaskRow('c2', { parentId: 'c1', mountDirId: 'd' }),
    ]
    expect(read(rows).status('c2')).toBe(HOLD)
    const after = act(rows, (model, ids) => planStatusOp(model, 'complete', 'p', ids))
    const view = read(after)
    expect(view.physical('c1')).toBe(HOLD)
    expect(view.physical('c2')).toBe(ACTIVE)
    expect(view.status('c2')).toBe(COMPLETED)
  })
})
