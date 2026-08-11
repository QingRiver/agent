import type { DeferDuePair, DeferDuePatch } from './normalize'
/**
 * 时间窗口联动行为规约（SP-LINK-TIME-*）。
 * 每条 `it` 上方 `// SP-LINK-TIME-*` 与 `wiki/draft/gtd行为规约.md` 一一对应。
 * 当前实现在 `normalize.ts` normalizeDeferDue（per-task 写路径规范化）。
 * 对齐 OmniFocus 4 三场景：直接修改不联动（A/B 不采纳保间隔/拉到Due之前，日期编辑走 patch=直接修改）+
 * CLAMP 硬钳制（冲突 defer>due 钳到相等，比 OF4 更严）+ 重复平移保间隔（command/repeat.ts computeNextDates，不在此处）。
 */
import { describe, expect, it } from 'vitest'
import { normalizeDeferDue } from './normalize'

const ISO = (d: string) => d

describe('defer↔due 窗口联动 [SP-LINK-TIME]', () => {
  // SP-LINK-TIME-0: 前提双侧有值才联动
  describe('双侧前提 [SP-LINK-TIME-0]', () => {
    it('merged deferDate=null → 直接返回不钳（defer 旗标保留 null）', () => {
      const cur: DeferDuePair = { deferDate: '2026-07-16T00:00:00.000Z', dueDate: '2026-07-18T00:00:00.000Z' }
      expect(normalizeDeferDue(cur, { deferDate: null })).toEqual({
        deferDate: null,
        dueDate: '2026-07-18T00:00:00.000Z',
      })
    })
    it('merged dueDate=null → 直接返回不钳', () => {
      const cur: DeferDuePair = { deferDate: '2026-07-16T00:00:00.000Z', dueDate: '2026-07-18T00:00:00.000Z' }
      expect(normalizeDeferDue(cur, { dueDate: null })).toEqual({
        deferDate: '2026-07-16T00:00:00.000Z',
        dueDate: null,
      })
    })
    it('双侧从 null 仅写一侧 → 另一侧保持 null（不联动）', () => {
      expect(normalizeDeferDue(
        { deferDate: null, dueDate: null },
        { deferDate: '2026-07-20T00:00:00.000Z' },
      )).toEqual({ deferDate: '2026-07-20T00:00:00.000Z', dueDate: null })
    })
  })

  // SP-LINK-TIME-CLAMP: defer≤due 硬钳制（冲突时后写优先钳到相等）
  describe('硬钳制 [SP-LINK-TIME-CLAMP]', () => {
    it('只改 defer 致 defer>due → due=defer（钳到相等）', () => {
      const cur: DeferDuePair = { deferDate: '2026-07-16T00:00:00.000Z', dueDate: '2026-07-18T00:00:00.000Z' }
      expect(normalizeDeferDue(cur, { deferDate: '2026-07-20T00:00:00.000Z' })).toEqual({
        deferDate: '2026-07-20T00:00:00.000Z',
        dueDate: '2026-07-20T00:00:00.000Z',
      })
    })
    it('只改 due 致 defer>due → defer=due（钳到相等）', () => {
      const cur: DeferDuePair = { deferDate: '2026-07-16T00:00:00.000Z', dueDate: '2026-07-18T00:00:00.000Z' }
      expect(normalizeDeferDue(cur, { dueDate: '2026-07-15T00:00:00.000Z' })).toEqual({
        deferDate: '2026-07-15T00:00:00.000Z',
        dueDate: '2026-07-15T00:00:00.000Z',
      })
    })
    it('defer≤due 保持（合法不钳）', () => {
      const cur: DeferDuePair = { deferDate: '2026-07-16T00:00:00.000Z', dueDate: '2026-07-18T00:00:00.000Z' }
      expect(normalizeDeferDue(cur, { deferDate: '2026-07-17T00:00:00.000Z' })).toEqual({
        deferDate: '2026-07-17T00:00:00.000Z',
        dueDate: '2026-07-18T00:00:00.000Z',
      })
    })
  })

  // SP-LINK-TIME-A: 后延 Defer（直接修改）→ Due 不顺延保间隔（对齐 OF4 直接修改不联动）；
  // 冲突 defer>due 时 CLAMP 硬钳制 due=defer（间隔归零；本仓库比 OF4 更严，OF4 允许 defer>due 悖论态，此处禁止）。
  // A 的「保间隔顺延」属相对推迟操作联动，本仓库无相对推迟按钮（日期编辑走 patch 直接修改），故不采纳。
  it('后延 Defer 致 defer>due：Due 不顺延，CLAMP 钳到 due=defer [SP-LINK-TIME-A]', () => {
    const cur: DeferDuePair = { deferDate: '2026-05-01T00:00:00.000Z', dueDate: '2026-05-05T00:00:00.000Z' } // 间隔 4 天
    const got = normalizeDeferDue(cur, { deferDate: '2026-05-10T00:00:00.000Z' })
    // 直接修改不联动：Due 不顺延到 5/14 保间隔；CLAMP 硬钳制：due=defer=5/10
    expect(got).toEqual({ deferDate: '2026-05-10T00:00:00.000Z', dueDate: '2026-05-10T00:00:00.000Z' })
  })

  // SP-LINK-TIME-B: 提前 Due（直接修改）→ Defer 不拉到 Due 之前（对齐 OF4 直接修改不联动）；
  // 冲突 defer>due 时 CLAMP 硬钳制 defer=due。B 的「拉到 Due 之前」不采纳（同 A 理由）。
  it('提前 Due 致 defer>due：Defer 不拉到 Due 之前，CLAMP 钳到 defer=due [SP-LINK-TIME-B]', () => {
    const cur: DeferDuePair = { deferDate: '2026-07-16T00:00:00.000Z', dueDate: '2026-07-18T00:00:00.000Z' }
    const got = normalizeDeferDue(cur, { dueDate: '2026-07-14T00:00:00.000Z' }) // 新 Due 早于原 Defer
    // 直接修改不联动：Defer 不拉到 7/13（Due 之前）；CLAMP 硬钳制：defer=due=7/14
    expect(got).toEqual({ deferDate: '2026-07-14T00:00:00.000Z', dueDate: '2026-07-14T00:00:00.000Z' })
  })

  // SP-LINK-TIME-C: 推迟 Due / 提前 Defer → 不联动（只拉长窗口）
  describe('不联动 [SP-LINK-TIME-C]', () => {
    it('推迟 Due（仍晚于 Defer）→ Defer 不动', () => {
      const cur: DeferDuePair = { deferDate: '2026-07-16T00:00:00.000Z', dueDate: '2026-07-18T00:00:00.000Z' }
      expect(normalizeDeferDue(cur, { dueDate: '2026-07-25T00:00:00.000Z' })).toEqual({
        deferDate: '2026-07-16T00:00:00.000Z',
        dueDate: '2026-07-25T00:00:00.000Z',
      })
    })
    it('提前 Defer（仍早于 Due）→ Due 不动', () => {
      const cur: DeferDuePair = { deferDate: '2026-07-16T00:00:00.000Z', dueDate: '2026-07-18T00:00:00.000Z' }
      expect(normalizeDeferDue(cur, { deferDate: '2026-07-10T00:00:00.000Z' })).toEqual({
        deferDate: '2026-07-10T00:00:00.000Z',
        dueDate: '2026-07-18T00:00:00.000Z',
      })
    })
  })

  // SP-LINK-TIME-SELF: 窗口只改自身物理 defer/due；禁止联动非自身字段；继承有效值读时重算
  it('只改自身物理 defer/due（返回对象仅含 deferDate/dueDate）[SP-LINK-TIME-SELF]', () => {
    const cur: DeferDuePair = { deferDate: '2026-07-16T00:00:00.000Z', dueDate: '2026-07-18T00:00:00.000Z' }
    const got = normalizeDeferDue(cur, { deferDate: '2026-07-20T00:00:00.000Z' })
    expect(Object.keys(got).sort()).toEqual(['deferDate', 'dueDate'])
  })

  // SP-LINK-TIME-PLAN: plannedDate 不参与窗口规范化
  it('plannedDate 不在规范化输入/输出（结构上不参与）[SP-LINK-TIME-PLAN]', () => {
    const cur: DeferDuePair = { deferDate: '2026-07-16T00:00:00.000Z', dueDate: '2026-07-18T00:00:00.000Z' }
    const patch: DeferDuePatch = { deferDate: '2026-07-17T00:00:00.000Z' }
    const got = normalizeDeferDue(cur, patch)
    // plannedDate 不在 DeferDuePatch 类型，规范化不会触及；输出仅 defer/due
    expect(Object.keys(got)).not.toContain('plannedDate')
    void ISO // 占位避免 unused
  })
})
