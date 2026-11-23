/**
 * wiki/GTD.md「解锁时间」地板。物理值不改写，生效值取更晚的一侧。
 */
import { describe, expect, it } from 'vitest'
import { makeTaskRow } from '../fixtures'
import { read, task } from './run'

const WED = '2026-07-15T09:00:00.000Z'
const FRI = '2026-07-17T09:00:00.000Z'

function pair(parentDefer: string | null, childDefer: string | null) {
  return [
    makeTaskRow('p', { deferDate: parentDefer, mountDirId: 'd', groupType: 'parallel' }),
    makeTaskRow('c', { parentId: 'p', deferDate: childDefer, mountDirId: 'd' }),
  ]
}

describe('解锁时间地板', () => {
  it('1 双不设置', () => {
    const rows = pair(null, null)
    expect(read(rows).defer('c')).toBeNull()
  })

  it('2 仅父设置：子继承父的生效解锁', () => {
    const rows = pair(FRI, null)
    expect(read(rows).defer('c')).toBe(FRI)
    expect(task(rows, 'c').data.deferDate).toBeNull()
  })

  it('3 仅子设置：用子自己的解锁', () => {
    const rows = pair(null, WED)
    expect(read(rows).defer('c')).toBe(WED)
  })

  it('4 父比子晚：生效被抬升，物理值仍是周三', () => {
    const rows = pair(FRI, WED)
    expect(read(rows).defer('c')).toBe(FRI)
    expect(task(rows, 'c').data.deferDate).toBe(WED)
  })

  it('5 子比父晚：生效取子的周五', () => {
    const rows = pair(WED, FRI)
    expect(read(rows).defer('c')).toBe(FRI)
    expect(task(rows, 'p').data.deferDate).toBe(WED)
  })
})
