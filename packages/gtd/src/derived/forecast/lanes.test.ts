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
import { buildTaskTree } from '../../structure/tree'

describe('lanes mermaid branches', () => {
  const oToday = opts([FORECAST_STRIP.NOW])
  const oPastToday = opts([FORECAST_STRIP.PAST, FORECAST_STRIP.NOW])
  const oWide = opts([
    FORECAST_STRIP.NOW,
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
      expect(laneOverdueDue(t, opts([FORECAST_STRIP.NOW]), NOW, TZ).overdue).toBeNull()
      expect(laneOverdueDue(
        t,
        opts([FORECAST_STRIP.PAST, FORECAST_STRIP.NOW], { ...DEFAULT_FORECAST_SIGNALS, includeOverdue: false }),
        NOW,
        TZ,
      ).overdue).toBeNull()
    })
    it('时段内截止 → 截止栏该日', () => {
      const t = makeTaskRow('d', { dueDate: TODAY })
      expect(laneOverdueDue(t, oToday, NOW, TZ).due?.block).toBe(FORECAST_STRIP.NOW)
    })
    it('关截止信号 → 截止栏空', () => {
      const t = makeTaskRow('d2', { dueDate: TODAY })
      expect(laneOverdueDue(
        t,
        opts([FORECAST_STRIP.NOW], { ...DEFAULT_FORECAST_SIGNALS, includeDue: false }),
        NOW,
        TZ,
      ).due).toBeNull()
    })
    it('未到截止 → 截止栏空', () => {
      const t = makeTaskRow('d3', { dueDate: LATER_DAY })
      expect(laneOverdueDue(t, oToday, NOW, TZ).due).toBeNull()
    })
    it('子无物理 due + 父有 due → 经 tree 按 effectiveDue 入截止栏', () => {
      const parent = makeTaskRow('parent', { dueDate: TODAY })
      const child = makeTaskRow('child', { parentId: 'parent' })
      const tree = buildTaskTree([parent, child])
      expect(laneOverdueDue(child, oToday, NOW, TZ).due).toBeNull()
      expect(laneOverdueDue(child, oToday, NOW, TZ, tree).due?.block).toBe(FORECAST_STRIP.NOW)
    })
    it('父 due 更紧急 → 子物理晚也按 effectiveDue 入今日', () => {
      const parent = makeTaskRow('parent', { dueDate: TODAY })
      const child = makeTaskRow('child', { parentId: 'parent', dueDate: LATER_DAY })
      const tree = buildTaskTree([parent, child])
      expect(laneOverdueDue(child, oToday, NOW, TZ).due).toBeNull()
      expect(laneOverdueDue(child, oToday, NOW, TZ, tree).due?.block).toBe(FORECAST_STRIP.NOW)
    })
  })

  describe('推迟', () => {
    it('无解锁 → 空', () => {
      expect(laneDeferred(makeTaskRow('x', {}), oToday, NOW, TZ)).toBeNull()
    })
    it('时段内解锁 → 该日', () => {
      expect(laneDeferred(makeTaskRow('x', { deferDate: TOMORROW }), opts([FORECAST_STRIP.LATER]), NOW, TZ)?.block)
        .toBe('2026-07-17')
    })
    it('关推迟信号 → 空', () => {
      expect(laneDeferred(
        makeTaskRow('x', { deferDate: TODAY }),
        opts([FORECAST_STRIP.NOW], { ...DEFAULT_FORECAST_SIGNALS, includeDeferred: false }),
        NOW,
        TZ,
      )).toBeNull()
    })
    it('非时段内 → 空', () => {
      expect(laneDeferred(makeTaskRow('x', { deferDate: TOMORROW }), oToday, NOW, TZ)).toBeNull()
    })
    it('子无物理 defer + 父有 defer → 经 tree 按 effectiveDefer 入推迟栏', () => {
      const parent = makeTaskRow('parent', { deferDate: TOMORROW })
      const child = makeTaskRow('child', { parentId: 'parent' })
      const tree = buildTaskTree([parent, child])
      expect(laneDeferred(child, opts([FORECAST_STRIP.LATER]), NOW, TZ)).toBeNull()
      expect(laneDeferred(child, opts([FORECAST_STRIP.LATER]), NOW, TZ, tree)?.block)
        .toBe('2026-07-17')
    })
  })

  describe('计划', () => {
    it('关计划信号 → 空', () => {
      expect(lanePlanned(
        makeTaskRow('p', { plannedMode: PLANNED_MODE.ROLLING }),
        opts([FORECAST_STRIP.NOW], { ...DEFAULT_FORECAST_SIGNALS, includePlanned: false }),
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
        opts([FORECAST_STRIP.LATER]),
        NOW,
        TZ,
      )?.block).toBe('2026-07-17')
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
      )?.block).toBe(FORECAST_STRIP.NOW)
    })
    it('滚动已解锁但锚日不在时段内 → 空', () => {
      expect(lanePlanned(
        makeTaskRow('p', { plannedMode: PLANNED_MODE.ROLLING }),
        opts([FORECAST_STRIP.LATER]),
        NOW,
        TZ,
      )).toBeNull()
    })
    it('子 none + 父 on → 经 tree coalesce 入计划栏', () => {
      const parent = makeTaskRow('parent', { plannedMode: PLANNED_MODE.ON, plannedDate: TOMORROW })
      const child = makeTaskRow('child', { parentId: 'parent' })
      const tree = buildTaskTree([parent, child])
      expect(lanePlanned(child, opts([FORECAST_STRIP.LATER]), NOW, TZ)).toBeNull()
      expect(lanePlanned(child, opts([FORECAST_STRIP.LATER]), NOW, TZ, tree)?.block)
        .toBe('2026-07-17')
    })
  })

  describe('旗标', () => {
    it('未旗标或关信号 → 空', () => {
      expect(laneFlagged(makeTaskRow('f', {}), oToday, NOW, TZ)).toBeNull()
      expect(laneFlagged(
        makeTaskRow('f', { flagged: true }),
        opts([FORECAST_STRIP.NOW], { ...DEFAULT_FORECAST_SIGNALS, includeFlagged: false }),
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
        .toBe(FORECAST_STRIP.NOW)
    })
    it('锚日不在时段内 → 空', () => {
      expect(laneFlagged(makeTaskRow('f', { flagged: true }), opts([FORECAST_STRIP.LATER]), NOW, TZ))
        .toBeNull()
    })
  })
})
