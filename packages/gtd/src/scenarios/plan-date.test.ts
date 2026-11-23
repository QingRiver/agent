/**
 * wiki/GTD.md「计划时间」coalesce：自身有计划就用自身，否则继承最近祖先。
 */
import { describe, expect, it } from 'vitest'
import { PLANNED_MODE } from '../data/types'
import { makeTaskRow } from '../fixtures'
import { read } from './run'

const DAY = '2026-07-20T00:00:00.000Z'
const EARLIER = '2026-07-10T00:00:00.000Z'

describe('计划时间', () => {
  it('子没有计划时继承父的计划日', () => {
    const rows = [
      makeTaskRow('p', { plannedMode: PLANNED_MODE.ON, plannedDate: DAY, mountDirId: 'd', groupType: 'parallel' }),
      makeTaskRow('c', { parentId: 'p', plannedMode: PLANNED_MODE.NONE, mountDirId: 'd' }),
    ]
    const view = read(rows)
    expect(view.plannedMode('c')).toBe(PLANNED_MODE.ON)
    expect(view.plannedDate('c')).toBe(DAY)
  })

  it('子自己写了计划日就覆盖父，可以早于父', () => {
    const rows = [
      makeTaskRow('p', { plannedMode: PLANNED_MODE.ON, plannedDate: DAY, mountDirId: 'd', groupType: 'parallel' }),
      makeTaskRow('c', { parentId: 'p', plannedMode: PLANNED_MODE.ON, plannedDate: EARLIER, mountDirId: 'd' }),
    ]
    const view = read(rows)
    expect(view.plannedDate('c')).toBe(EARLIER)
    expect(view.plannedDate('p')).toBe(DAY)
  })

  it('父是滚动计划、子没有计划：模式继承滚动，没有固定日期', () => {
    const rows = [
      makeTaskRow('p', { plannedMode: PLANNED_MODE.ROLLING, mountDirId: 'd', groupType: 'parallel' }),
      makeTaskRow('c', { parentId: 'p', plannedMode: PLANNED_MODE.NONE, mountDirId: 'd' }),
    ]
    const view = read(rows)
    expect(view.plannedMode('c')).toBe(PLANNED_MODE.ROLLING)
    expect(view.plannedDate('c')).toBeNull()
  })
})
