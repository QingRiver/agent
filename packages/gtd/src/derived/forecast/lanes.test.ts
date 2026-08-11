import { describe, expect, it } from 'vitest'
import {
  laneDeferred,
  laneFlagged,
  laneOverdueDue,
  lanePlanned,
} from '.'
import { PLANNED_MODE } from '../../data/types'
import {
  DEFAULT_FORECAST_SIGNALS,
  FORECAST_STRIP,
  LATER_DAY,
  makeTaskRow,
  NOW,
  opts,
  TODAY,
  TOMORROW,
  TZ,
  YESTERDAY,
} from '../../fixtures'

describe('lanes mermaid branches', () => {
  const oToday = opts([FORECAST_STRIP.TODAY])
  const oPastToday = opts([FORECAST_STRIP.PAST, FORECAST_STRIP.TODAY])
  const oWide = opts([
    FORECAST_STRIP.TODAY,
    FORECAST_STRIP.TOMORROW,
    FORECAST_STRIP.DAY_AFTER,
    FORECAST_STRIP.LATER,
  ])

  describe('逾期/截止', () => {
    it('无截止 → 两栏空', () => {
      const t = makeTaskRow('n', {})
      expect(laneOverdueDue(t, oToday, NOW, TZ)).toEqual({ overdue: null, due: null })
    })
    it('已截止 + includeOverdue+Past → 逾期过去', () => {
      const t = makeTaskRow('o', { dueDate: YESTERDAY })
      expect(laneOverdueDue(t, oPastToday, NOW, TZ).overdue?.block).toBe(FORECAST_STRIP.PAST)
    })
    it('已截止但关逾期或关过去 → 逾期空', () => {
      const t = makeTaskRow('o2', { dueDate: YESTERDAY })
      expect(laneOverdueDue(t, opts([FORECAST_STRIP.TODAY]), NOW, TZ).overdue).toBeNull()
      expect(laneOverdueDue(
        t,
        opts([FORECAST_STRIP.PAST, FORECAST_STRIP.TODAY], { ...DEFAULT_FORECAST_SIGNALS, includeOverdue: false }),
        NOW,
        TZ,
      ).overdue).toBeNull()
    })
    it('时段内截止 → 截止栏该日', () => {
      const t = makeTaskRow('d', { dueDate: TODAY })
      expect(laneOverdueDue(t, oToday, NOW, TZ).due?.block).toBe(FORECAST_STRIP.TODAY)
    })
    it('关截止信号 → 截止栏空', () => {
      const t = makeTaskRow('d2', { dueDate: TODAY })
      expect(laneOverdueDue(
        t,
        opts([FORECAST_STRIP.TODAY], { ...DEFAULT_FORECAST_SIGNALS, includeDue: false }),
        NOW,
        TZ,
      ).due).toBeNull()
    })
    it('未到截止 → 截止栏空', () => {
      const t = makeTaskRow('d3', { dueDate: LATER_DAY })
      expect(laneOverdueDue(t, oToday, NOW, TZ).due).toBeNull()
    })
  })

  describe('推迟', () => {
    it('无解锁 → 空', () => {
      expect(laneDeferred(makeTaskRow('x', {}), oToday, NOW, TZ)).toBeNull()
    })
    it('时段内解锁 → 该日', () => {
      expect(laneDeferred(makeTaskRow('x', { deferDate: TOMORROW }), opts([FORECAST_STRIP.TOMORROW]), NOW, TZ)?.block)
        .toBe(FORECAST_STRIP.TOMORROW)
    })
    it('关推迟信号 → 空', () => {
      expect(laneDeferred(
        makeTaskRow('x', { deferDate: TODAY }),
        opts([FORECAST_STRIP.TODAY], { ...DEFAULT_FORECAST_SIGNALS, includeDeferred: false }),
        NOW,
        TZ,
      )).toBeNull()
    })
    it('非时段内 → 空', () => {
      expect(laneDeferred(makeTaskRow('x', { deferDate: TOMORROW }), oToday, NOW, TZ)).toBeNull()
    })
  })

  describe('计划', () => {
    it('关计划信号 → 空', () => {
      expect(lanePlanned(
        makeTaskRow('p', { plannedMode: PLANNED_MODE.ROLLING }),
        opts([FORECAST_STRIP.TODAY], { ...DEFAULT_FORECAST_SIGNALS, includePlanned: false }),
        NOW,
        TZ,
      )).toBeNull()
    })
    it('选日已过 + includePast → 过去', () => {
      expect(lanePlanned(
        makeTaskRow('p', { plannedMode: PLANNED_MODE.ON, plannedDate: YESTERDAY }),
        oPastToday,
        NOW,
        TZ,
      )?.block).toBe(FORECAST_STRIP.PAST)
    })
    it('选日已过无 Past → 空', () => {
      expect(lanePlanned(
        makeTaskRow('p', { plannedMode: PLANNED_MODE.ON, plannedDate: YESTERDAY }),
        oToday,
        NOW,
        TZ,
      )).toBeNull()
    })
    it('选日在时段内 → 该日', () => {
      expect(lanePlanned(
        makeTaskRow('p', { plannedMode: PLANNED_MODE.ON, plannedDate: TOMORROW }),
        opts([FORECAST_STRIP.TOMORROW]),
        NOW,
        TZ,
      )?.block).toBe(FORECAST_STRIP.TOMORROW)
    })
    it('选日未到 → 空', () => {
      expect(lanePlanned(
        makeTaskRow('p', { plannedMode: PLANNED_MODE.ON, plannedDate: LATER_DAY }),
        oToday,
        NOW,
        TZ,
      )).toBeNull()
    })
    it('滚动墙钟未解锁 → 空', () => {
      expect(lanePlanned(
        makeTaskRow('p', { plannedMode: PLANNED_MODE.ROLLING, deferDate: TOMORROW }),
        oWide,
        NOW,
        TZ,
      )).toBeNull()
    })
    it('滚动已解锁且锚日在时段内 → 锚日', () => {
      expect(lanePlanned(
        makeTaskRow('p', { plannedMode: PLANNED_MODE.ROLLING }),
        oToday,
        NOW,
        TZ,
      )?.block).toBe(FORECAST_STRIP.TODAY)
    })
    it('滚动已解锁但锚日不在时段内 → 空', () => {
      expect(lanePlanned(
        makeTaskRow('p', { plannedMode: PLANNED_MODE.ROLLING }),
        opts([FORECAST_STRIP.TOMORROW]),
        NOW,
        TZ,
      )).toBeNull()
    })
  })

  describe('旗标', () => {
    it('未旗标或关信号 → 空', () => {
      expect(laneFlagged(makeTaskRow('f', {}), oToday, NOW, TZ)).toBeNull()
      expect(laneFlagged(
        makeTaskRow('f', { flagged: true }),
        opts([FORECAST_STRIP.TODAY], { ...DEFAULT_FORECAST_SIGNALS, includeFlagged: false }),
        NOW,
        TZ,
      )).toBeNull()
    })
    it('墙钟未解锁 → 空', () => {
      expect(laneFlagged(
        makeTaskRow('f', { flagged: true, deferDate: TOMORROW }),
        oWide,
        NOW,
        TZ,
      )).toBeNull()
    })
    it('已解锁且锚日在时段内 → 锚日', () => {
      expect(laneFlagged(makeTaskRow('f', { flagged: true }), oToday, NOW, TZ)?.block)
        .toBe(FORECAST_STRIP.TODAY)
    })
    it('锚日不在时段内 → 空', () => {
      expect(laneFlagged(makeTaskRow('f', { flagged: true }), opts([FORECAST_STRIP.TOMORROW]), NOW, TZ))
        .toBeNull()
    })
  })
})
