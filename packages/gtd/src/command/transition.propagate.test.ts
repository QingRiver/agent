import { describe, expect, it } from 'vitest'
import { EXPLICIT_STATUS } from '../data/types'
import { makeTaskRow, makeTransition, SYNC_NOW } from '../fixtures'
import { applyOps } from './apply'

function nextId(start = 0): () => number {
  let n = start
  return () => ++n
}

describe('propagateUp', () => {
  it('reopen flips completed ancestors and stops at a held ancestor', () => {
    const held = makeTaskRow('h', { status: EXPLICIT_STATUS.HOLD, statusChangedAt: SYNC_NOW, mountDirId: 'd', groupType: 'parallel' })
    const parent = makeTaskRow('p', { parentId: 'h', status: EXPLICIT_STATUS.COMPLETED, statusChangedAt: SYNC_NOW, mountDirId: 'd', groupType: 'parallel' })
    const child = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED, statusChangedAt: SYNC_NOW, mountDirId: 'd' })
    const rows = applyOps([held, parent, child], [makeTransition({ action: 'reopen', taskId: 'c' })], 'u1', nextId(3))
    const status = (taskId: string) => {
      const row = rows.find(item => item.entity === 'task' && item.id === taskId)
      return row?.entity === 'task' ? row.data : undefined
    }
    expect(status('c')?.status).toBe(EXPLICIT_STATUS.ACTIVE)
    expect(status('p')?.status).toBe(EXPLICIT_STATUS.ACTIVE)
    expect(status('h')?.status).toBe(EXPLICIT_STATUS.HOLD)
  })

  it('complete does not change a child status', () => {
    const parent = makeTaskRow('p', { mountDirId: 'd', groupType: 'parallel' })
    const child = makeTaskRow('c', { parentId: 'p', mountDirId: 'd' })
    const rows = applyOps([parent, child], [makeTransition({ action: 'complete', taskId: 'p' })], 'u1', nextId())
    const status = (taskId: string) => {
      const row = rows.find(item => item.entity === 'task' && item.id === taskId)
      return row?.entity === 'task' ? row.data.status : undefined
    }
    expect(status('c')).toBe(EXPLICIT_STATUS.ACTIVE)
    expect(status('p')).toBe(EXPLICIT_STATUS.COMPLETED)
  })

  it('rejects a repeated transition from the same status', () => {
    const rows = [makeTaskRow('t', { status: EXPLICIT_STATUS.COMPLETED, statusChangedAt: SYNC_NOW })]
    expect(() => applyOps(rows, [makeTransition({ taskId: 't' })], 'u1', () => 2)).toThrow(/不能标记完成/)
  })
})
