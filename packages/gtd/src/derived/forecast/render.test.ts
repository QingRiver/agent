import { describe, expect, it } from 'vitest'
import { renderForecast } from '.'
import { RowStore } from '../../data/rows'
import { COMPUTED_STATUS, EXPLICIT_STATUS, GROUP_TYPE, PLANNED_MODE } from '../../data/types'
import {
  DUE_SOON_MS,
  FORECAST_STRIP,
  makeTaskRow,
  NOW,
  opts,
  TODAY,
  TZ,
} from '../../fixtures'

describe('renderForecast', () => {
  it('产出今日块含 rolling 与 due', () => {
    const rows = [
      makeTaskRow('r1', { name: '滚', plannedMode: PLANNED_MODE.ROLLING, plannedDate: null }),
      makeTaskRow('d1', { name: '截止', dueDate: TODAY }),
    ]
    const groups = renderForecast(
      new RowStore(rows),
      opts([FORECAST_STRIP.TODAY]),
      NOW,
      DUE_SOON_MS,
      rows,
      TZ,
    )
    expect(groups.map(g => g.key)).toEqual([FORECAST_STRIP.TODAY])
    expect(groups[0]!.children).toHaveLength(2)
  })

  it('块内 computed 序：OVERDUE 先于 AVAILABLE', () => {
    const overdue = makeTaskRow('a', {
      name: '过',
      dueDate: '2026-07-16T08:00:00.000Z',
      order: 2,
    })
    const available = makeTaskRow('b', {
      name: '可',
      dueDate: '2026-07-16T20:00:00.000Z',
      order: 1,
    })
    const rows = [available, overdue]
    const groups = renderForecast(
      new RowStore(rows),
      opts([FORECAST_STRIP.TODAY]),
      NOW,
      DUE_SOON_MS,
      rows,
      TZ,
    )
    expect(groups[0]!.children.map(c => ('taskId' in c ? c.taskId : ''))).toEqual(['a', 'b'])
    const first = groups[0]!.children[0]!
    expect('computed' in first && first.computed).toBe(COMPUTED_STATUS.OVERDUE)
  })

  it('以后块标签用时区日历日（上海不因 UTC 错一天）', () => {
    // 2026-07-23 00:00 Asia/Shanghai = 2026-07-22T16:00:00.000Z
    const dueShanghaiDay = '2026-07-22T16:00:00.000Z'
    const rows = [makeTaskRow('l1', { dueDate: dueShanghaiDay })]
    const now = new Date('2026-07-16T12:00:00.000Z')
    const tz = 'Asia/Shanghai'
    const groups = renderForecast(
      new RowStore(rows),
      opts([FORECAST_STRIP.LATER], undefined, now, tz),
      now,
      DUE_SOON_MS,
      rows,
      tz,
    )
    const later = groups.find(g => g.key === '2026-07-23')
    expect(later).toBeDefined()
    expect(later!.label).toBe('2026-07-23')
  })

  it('全量树：父已完成被滤掉时子任务仍 BLOCKED', () => {
    const parent = makeTaskRow('parent', {
      name: '父',
      status: EXPLICIT_STATUS.COMPLETED,
      completedAt: '2026-07-15T00:00:00.000Z',
      groupType: GROUP_TYPE.PARALLEL,
      dueDate: TODAY,
    })
    const child = makeTaskRow('child', {
      name: '子',
      parentId: 'parent',
      dueDate: TODAY,
      order: 1,
    })
    const store = new RowStore([parent, child])
    // 模拟 applyBaseFilter：仅剩余任务（父已完成不在列表）
    const filtered = [child]
    const groups = renderForecast(
      store,
      opts([FORECAST_STRIP.TODAY]),
      NOW,
      DUE_SOON_MS,
      filtered,
      TZ,
    )
    const item = groups[0]!.children.find(c => 'taskId' in c && c.taskId === 'child')
    expect(item && 'computed' in item && item.computed).toBe(COMPUTED_STATUS.BLOCKED)
    expect(item && 'depth' in item && item.depth).toBe(1)
  })

  it('全量树：sequential 前序不在过滤列表时后序仍 BLOCKED', () => {
    const parent = makeTaskRow('parent', {
      name: '序',
      groupType: GROUP_TYPE.SEQUENTIAL,
      dueDate: TODAY,
    })
    const first = makeTaskRow('first', {
      name: '先',
      parentId: 'parent',
      order: 1,
    })
    const second = makeTaskRow('second', {
      name: '后',
      parentId: 'parent',
      dueDate: TODAY,
      order: 2,
    })
    const store = new RowStore([parent, first, second])
    const filtered = [parent, second]
    const groups = renderForecast(
      store,
      opts([FORECAST_STRIP.TODAY]),
      NOW,
      DUE_SOON_MS,
      filtered,
      TZ,
    )
    const item = groups[0]!.children.find(c => 'taskId' in c && c.taskId === 'second')
    expect(item && 'computed' in item && item.computed).toBe(COMPUTED_STATUS.BLOCKED)
  })
})
