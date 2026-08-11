import { describe, expect, it } from 'vitest'
import {
  assignForecastBlock,
  laneOverdueDue,
  lanePlanned,
  pickByTier,
} from '.'
import { PLANNED_MODE } from '../../data/types'
import {
  DAY_AFTER,
  DEFAULT_FORECAST_SIGNALS,
  FORECAST_STRIP,
  LATER_DAY,
  makeTaskRow,
  NEXT_WEEK_DEFER,
  NOW,
  opts,
  TODAY,
  TOMORROW,
  TZ,
  YESTERDAY,
} from '../../fixtures'

describe('pickByTier', () => {
  it('逾期 > 截止 > 推迟 > 计划 > 旗标；皆空 → null', () => {
    expect(pickByTier([
      { lane: 'flagged', block: FORECAST_STRIP.TODAY },
      { lane: 'planned', block: FORECAST_STRIP.TODAY },
      { lane: 'due', block: FORECAST_STRIP.TODAY },
    ])?.lane).toBe('due')
    expect(pickByTier([null, null])).toBeNull()
  })
})

describe('速查例', () => {
  it('未到截止，开截止，无计划 → 不出现', () => {
    const t = makeTaskRow('e1', { dueDate: LATER_DAY })
    expect(assignForecastBlock(t, opts([FORECAST_STRIP.TODAY]), NOW, TZ)).toBeNull()
  })

  it('未到截止 + 滚动（已解锁、锚日在时段内）→ 计划锚日', () => {
    const t = makeTaskRow('e2', {
      dueDate: LATER_DAY,
      plannedMode: PLANNED_MODE.ROLLING,
    })
    expect(assignForecastBlock(t, opts([FORECAST_STRIP.TODAY]), NOW, TZ)).toBe(FORECAST_STRIP.TODAY)
  })

  it('时段内截止 + 计划同日 → 截止', () => {
    const t = makeTaskRow('e3', {
      dueDate: TODAY,
      plannedMode: PLANNED_MODE.ON,
      plannedDate: TODAY,
    })
    expect(assignForecastBlock(t, opts([FORECAST_STRIP.TODAY]), NOW, TZ)).toBe(FORECAST_STRIP.TODAY)
    const { due } = laneOverdueDue(t, opts([FORECAST_STRIP.TODAY]), NOW, TZ)
    const planned = lanePlanned(t, opts([FORECAST_STRIP.TODAY]), NOW, TZ)
    expect(due).not.toBeNull()
    expect(planned).not.toBeNull()
    expect(pickByTier([due, planned])?.lane).toBe('due')
  })

  it('已截止，开逾期+过去 → 过去', () => {
    const t = makeTaskRow('e4', { dueDate: YESTERDAY })
    expect(assignForecastBlock(t, opts([FORECAST_STRIP.PAST, FORECAST_STRIP.TODAY]), NOW, TZ))
      .toBe(FORECAST_STRIP.PAST)
  })

  it('墙钟未解锁 + 计划日在时段内 → 计划', () => {
    const t = makeTaskRow('e5', {
      deferDate: TOMORROW,
      plannedMode: PLANNED_MODE.ON,
      plannedDate: TODAY,
    })
    expect(assignForecastBlock(t, opts([FORECAST_STRIP.TODAY]), NOW, TZ))
      .toBe(FORECAST_STRIP.TODAY)
  })

  it('墙钟未解锁 + 仅滚动 → 不出现', () => {
    const t = makeTaskRow('e6', {
      deferDate: TOMORROW,
      plannedMode: PLANNED_MODE.ROLLING,
    })
    expect(assignForecastBlock(t, opts([FORECAST_STRIP.TODAY]), NOW, TZ)).toBeNull()
  })

  it('时段内解锁 → 推迟', () => {
    const t = makeTaskRow('e7', { deferDate: TOMORROW })
    expect(assignForecastBlock(t, opts([FORECAST_STRIP.TOMORROW]), NOW, TZ)).toBe(FORECAST_STRIP.TOMORROW)
  })

  it('墙钟已解锁 + 仅旗标，锚日在时段内 → 旗标', () => {
    const t = makeTaskRow('e8', { flagged: true })
    expect(assignForecastBlock(t, opts([FORECAST_STRIP.TODAY]), NOW, TZ)).toBe(FORECAST_STRIP.TODAY)
  })

  it('大窗含今日与下周；下周才解锁 + 滚动 → 推迟栏（计划空）', () => {
    const t = makeTaskRow('e9', {
      deferDate: NEXT_WEEK_DEFER,
      plannedMode: PLANNED_MODE.ROLLING,
    })
    const o = opts([
      FORECAST_STRIP.TODAY,
      FORECAST_STRIP.TOMORROW,
      FORECAST_STRIP.DAY_AFTER,
      FORECAST_STRIP.LATER,
    ])
    expect(lanePlanned(t, o, NOW, TZ)).toBeNull()
    expect(assignForecastBlock(t, o, NOW, TZ)).toBe('2026-07-23')
  })

  it('大窗 + 下周解锁 + 滚动 + 关推迟 → 不出现', () => {
    const t = makeTaskRow('e9b', {
      deferDate: NEXT_WEEK_DEFER,
      plannedMode: PLANNED_MODE.ROLLING,
    })
    const o = opts(
      [
        FORECAST_STRIP.TODAY,
        FORECAST_STRIP.TOMORROW,
        FORECAST_STRIP.DAY_AFTER,
        FORECAST_STRIP.LATER,
      ],
      { ...DEFAULT_FORECAST_SIGNALS, includeDeferred: false },
    )
    expect(assignForecastBlock(t, o, NOW, TZ)).toBeNull()
  })
})

describe('assignForecastBlock 回归', () => {
  it('仅 rolling → 今日；多日选中不复制到明天', () => {
    const t = makeTaskRow('r1', { plannedMode: PLANNED_MODE.ROLLING, plannedDate: null })
    const o = opts([FORECAST_STRIP.TODAY, FORECAST_STRIP.TOMORROW, FORECAST_STRIP.DAY_AFTER])
    expect(assignForecastBlock(t, o, NOW, TZ)).toBe(FORECAST_STRIP.TODAY)
  })

  it('rolling + 过期 due → 过去', () => {
    const t = makeTaskRow('r2', {
      plannedMode: PLANNED_MODE.ROLLING,
      plannedDate: null,
      dueDate: YESTERDAY,
    })
    const o = opts([FORECAST_STRIP.PAST, FORECAST_STRIP.TODAY])
    expect(assignForecastBlock(t, o, NOW, TZ)).toBe(FORECAST_STRIP.PAST)
  })

  it('rolling + 明天 defer → 明天块（推迟栏；滚动因墙钟锁空）', () => {
    const t = makeTaskRow('r3', {
      plannedMode: PLANNED_MODE.ROLLING,
      plannedDate: null,
      deferDate: TOMORROW,
    })
    const o = opts([FORECAST_STRIP.TODAY, FORECAST_STRIP.TOMORROW])
    expect(assignForecastBlock(t, o, NOW, TZ)).toBe(FORECAST_STRIP.TOMORROW)
  })

  it('due 今日 → 今日', () => {
    const t = makeTaskRow('d1', { dueDate: TODAY })
    expect(assignForecastBlock(t, opts([FORECAST_STRIP.TODAY]), NOW, TZ)).toBe(FORECAST_STRIP.TODAY)
  })

  it('planned on 明天 → 明天', () => {
    const t = makeTaskRow('p1', {
      plannedMode: PLANNED_MODE.ON,
      plannedDate: TOMORROW,
    })
    expect(assignForecastBlock(t, opts([FORECAST_STRIP.TOMORROW]), NOW, TZ)).toBe(FORECAST_STRIP.TOMORROW)
  })

  it('仅 flagged → 今日', () => {
    const t = makeTaskRow('f1', { flagged: true })
    expect(assignForecastBlock(t, opts([FORECAST_STRIP.TODAY]), NOW, TZ)).toBe(FORECAST_STRIP.TODAY)
  })

  it('flagged + 后天 defer → 后天（推迟栏）', () => {
    const t = makeTaskRow('f2', { flagged: true, deferDate: DAY_AFTER })
    const o = opts([FORECAST_STRIP.TODAY, FORECAST_STRIP.TOMORROW, FORECAST_STRIP.DAY_AFTER])
    expect(assignForecastBlock(t, o, NOW, TZ)).toBe(FORECAST_STRIP.DAY_AFTER)
  })

  it('以后窗：远期 due → 该日 YYYY-MM-DD 块', () => {
    const t = makeTaskRow('l1', { dueDate: LATER_DAY })
    const block = assignForecastBlock(t, opts([FORECAST_STRIP.LATER]), NOW, TZ)
    expect(block).toBe('2026-07-23')
  })

  it('用户时区日界：UTC 已跨日、LA 仍昨日', () => {
    const now = new Date('2026-07-16T02:00:00.000Z')
    const dueOnLaToday = '2026-07-15T12:00:00.000Z'
    const t = makeTaskRow('tz1', { dueDate: dueOnLaToday })
    const la = 'America/Los_Angeles'
    const oLa = opts([FORECAST_STRIP.PAST, FORECAST_STRIP.TODAY], DEFAULT_FORECAST_SIGNALS, now, la)
    expect(assignForecastBlock(t, oLa, now, la)).toBe(FORECAST_STRIP.TODAY)
    const oUtc = opts([FORECAST_STRIP.PAST, FORECAST_STRIP.TODAY], DEFAULT_FORECAST_SIGNALS, now, 'UTC')
    expect(assignForecastBlock(t, oUtc, now, 'UTC')).toBe(FORECAST_STRIP.PAST)
  })
})
