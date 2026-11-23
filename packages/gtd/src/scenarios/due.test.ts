/**
 * wiki/GTD.md「截止时间」天花板。物理值不改写，生效值取更早的一侧。
 */
import { describe, expect, it } from 'vitest'
import { makeTaskRow } from '../fixtures'
import { read, task } from './run'

const WED = '2026-07-15T12:00:00.000Z'
const FRI = '2026-07-17T17:00:00.000Z'

function pair(parentDue: string | null, childDue: string | null) {
  return [
    makeTaskRow('p', { dueDate: parentDue, mountDirId: 'd', groupType: 'parallel' }),
    makeTaskRow('c', { parentId: 'p', dueDate: childDue, mountDirId: 'd' }),
  ]
}

describe('截止时间天花板', () => {
  it('1 双不设置', () => {
    const rows = pair(null, null)
    expect(read(rows).due('c')).toBeNull()
  })

  it('2 仅父设置：子继承父的生效截止', () => {
    const rows = pair(FRI, null)
    expect(read(rows).due('c')).toBe(FRI)
    expect(task(rows, 'c').data.dueDate).toBeNull()
  })

  it('3 仅子设置：用子自己的截止', () => {
    const rows = pair(null, WED)
    expect(read(rows).due('c')).toBe(WED)
  })

  it('4 父比子紧急：生效被截断，物理值仍是周五', () => {
    const rows = pair(WED, FRI)
    expect(read(rows).due('c')).toBe(WED)
    expect(task(rows, 'c').data.dueDate).toBe(FRI)
  })

  it('5 子比父紧急：生效取子的周三', () => {
    const rows = pair(FRI, WED)
    expect(read(rows).due('c')).toBe(WED)
    expect(task(rows, 'p').data.dueDate).toBe(FRI)
  })
})
