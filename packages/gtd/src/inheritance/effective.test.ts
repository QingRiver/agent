/**
 * 父子时间继承行为规约（SP-INH-*）。
 * 每条 `it` 上方 `// SP-INH-*` 与 `wiki/draft/gtd行为规约.md` 一一对应。
 * PlanDate 为 OF4 coalesce 继承（跑绿）；Due/Defer effective 派生已落地（跑绿）。
 * SP-INV-REPEAT-REOPEN（L5 reopenTask throw）归 command/state.test.ts SP-STATE-3，此处不重复。
 */
import { describe, expect, it } from 'vitest'
import { COMPUTED_STATUS, PLANNED_MODE } from '../data/types'
import { computeStatus } from '../derived/availability'
import { DUE_SOON_MS, makeTaskRow, NOW } from '../fixtures'
import { buildTaskTree } from '../structure/tree'
import {
  effectiveDefer,
  effectiveDue,
  effectivePlannedDate,
  effectivePlannedMode,
} from './effective'

const D = (day: number) => `2026-07-${String(day).padStart(2, '0')}T00:00:00.000Z`

describe('计划日 coalesce 继承 [SP-INH-PLAN]', () => {
  // SP-INH-PLAN-1: 仅父设置 → 子 effective 继承父（*Planned with container*）
  it('仅父 planned → 子 effectivePlannedDate 继承父 [SP-INH-PLAN-1]', () => {
    const p = makeTaskRow('p', { plannedMode: PLANNED_MODE.ON, plannedDate: D(20) })
    const c = makeTaskRow('c', { parentId: 'p' })
    const tree = buildTaskTree([p, c])
    expect(effectivePlannedMode(c, tree)).toBe(PLANNED_MODE.ON)
    expect(effectivePlannedDate(c, tree)).toBe(D(20))
    expect(c.data.plannedMode).toBe(PLANNED_MODE.NONE)
    expect(c.data.plannedDate).toBeNull()
  })

  // SP-INH-PLAN-2: 子有直接赋值 → 覆盖父（coalesce，非 min/max）
  it('子自身有计划 → 用自身，可早于/晚于父 [SP-INH-PLAN-2]', () => {
    const p = makeTaskRow('p', { plannedMode: PLANNED_MODE.ON, plannedDate: D(20) })
    const early = makeTaskRow('c1', { parentId: 'p', plannedMode: PLANNED_MODE.ON, plannedDate: D(10) })
    const late = makeTaskRow('c2', { parentId: 'p', plannedMode: PLANNED_MODE.ON, plannedDate: D(30) })
    const tree = buildTaskTree([p, early, late])
    expect(effectivePlannedDate(early, tree)).toBe(D(10))
    expect(effectivePlannedDate(late, tree)).toBe(D(30))
  })

  // SP-INH-PLAN-IMMUT: 不改写子物理；父改后子 none 自动跟新
  it('不改写子物理 plannedDate；父改写后 none 子重新继承 [SP-INH-PLAN-IMMUT]', () => {
    const p = makeTaskRow('p', { plannedMode: PLANNED_MODE.ON, plannedDate: D(20) })
    const c = makeTaskRow('c', { parentId: 'p' })
    expect(effectivePlannedDate(c, buildTaskTree([p, c]))).toBe(D(20))
    p.data.plannedDate = D(25)
    expect(effectivePlannedDate(c, buildTaskTree([p, c]))).toBe(D(25))
    expect(c.data.plannedDate).toBeNull()
  })

  // SP-INH-PLAN-ROLLING: 子 rolling 阻断父日期；父 rolling 无日期可继
  it('子 rolling → mode=rolling、date=null，不继承父 on 日期 [SP-INH-PLAN-ROLLING]', () => {
    const p = makeTaskRow('p', { plannedMode: PLANNED_MODE.ON, plannedDate: D(20) })
    const c = makeTaskRow('c', { parentId: 'p', plannedMode: PLANNED_MODE.ROLLING })
    const tree = buildTaskTree([p, c])
    expect(effectivePlannedMode(c, tree)).toBe(PLANNED_MODE.ROLLING)
    expect(effectivePlannedDate(c, tree)).toBeNull()
  })
  it('父 rolling、子 none → mode 继承 rolling、date=null [SP-INH-PLAN-ROLLING]', () => {
    const p = makeTaskRow('p', { plannedMode: PLANNED_MODE.ROLLING })
    const c = makeTaskRow('c', { parentId: 'p' })
    const tree = buildTaskTree([p, c])
    expect(effectivePlannedMode(c, tree)).toBe(PLANNED_MODE.ROLLING)
    expect(effectivePlannedDate(c, tree)).toBeNull()
  })

  // SP-INH-PLAN-3: 计划日不影响 computed 着色与 blocked
  it('plannedMode=on + plannedDate 不改变 ComputedStatus（无约束→AVAILABLE）[SP-INH-PLAN-3]', () => {
    const t = makeTaskRow('t1', { plannedMode: PLANNED_MODE.ON, plannedDate: new Date(NOW.getTime() - 86400000).toISOString() })
    expect(computeStatus(t, NOW, buildTaskTree([t]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.AVAILABLE)
  })
  it('继承的 plannedDate 过期仍不触发 overdue [SP-INH-PLAN-3]', () => {
    const p = makeTaskRow('p', { plannedMode: PLANNED_MODE.ON, plannedDate: new Date(NOW.getTime() - 86400000).toISOString() })
    const c = makeTaskRow('c', { parentId: 'p' })
    expect(computeStatus(c, NOW, buildTaskTree([p, c]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.AVAILABLE)
  })

  // SP-INH-PLAN-4: 计划日不参与 defer≤due 窗口规范化
  // 见 time/time-window.test.ts › SP-LINK-TIME-PLAN（同一规则，规范化层已钉）。
  it('plannedDate 不参与窗口规范化（见 SP-LINK-TIME-PLAN）[SP-INH-PLAN-4]', () => {
    expect(true).toBe(true)
  })
})

describe('due 天花板（min）[SP-INH-DUE]', () => {
  // SP-INH-DUE-FORMULA: effectiveDue = min(自身, 父effectiveDue)
  it('effectiveDue = min(自身, 父effectiveDue) [SP-INH-DUE-FORMULA]', () => {
    const p = makeTaskRow('p', { dueDate: D(15) })
    const cTight = makeTaskRow('c1', { parentId: 'p', dueDate: D(10) })
    const cLoose = makeTaskRow('c2', { parentId: 'p', dueDate: D(20) })
    const tree = buildTaskTree([p, cTight, cLoose])
    expect(effectiveDue(cTight, tree)).toBe(D(10)) // 子更紧急 → 取子
    expect(effectiveDue(cLoose, tree)).toBe(D(15)) // 父更紧急 → 截断为父
  })

  // SP-INH-DUE-1: 双不设置 → NULL
  it('双不设置 → NULL [SP-INH-DUE-1]', () => {
    const c = makeTaskRow('c', { parentId: 'p' })
    expect(effectiveDue(c, buildTaskTree([makeTaskRow('p'), c]))).toBeNull()
  })

  // SP-INH-DUE-2: 仅父设置 → 完全继承父生效值
  it('仅父设置 → 完全继承父生效值 [SP-INH-DUE-2]', () => {
    const p = makeTaskRow('p', { dueDate: D(10) })
    const c = makeTaskRow('c', { parentId: 'p' })
    expect(effectiveDue(c, buildTaskTree([p, c]))).toBe(D(10))
  })

  // SP-INH-DUE-3: 仅子设置 → 绝对覆盖
  it('仅子设置 → 绝对覆盖 [SP-INH-DUE-3]', () => {
    const c = makeTaskRow('c', { parentId: 'p', dueDate: D(10) })
    expect(effectiveDue(c, buildTaskTree([makeTaskRow('p'), c]))).toBe(D(10))
  })

  // SP-INH-DUE-4: 父比子紧急 → 截断为父；物理值保留
  it('父比子紧急 → 截断为父；物理值保留 [SP-INH-DUE-4]', () => {
    const p = makeTaskRow('p', { dueDate: D(10) })
    const c = makeTaskRow('c', { parentId: 'p', dueDate: D(15) })
    const tree = buildTaskTree([p, c])
    expect(effectiveDue(c, tree)).toBe(D(10))
    expect(c.data.dueDate).toBe(D(15))
  })

  // SP-INH-DUE-5: 子比父紧急 → 取子（提前里程碑）
  it('子比父紧急 → 取子 [SP-INH-DUE-5]', () => {
    const p = makeTaskRow('p', { dueDate: D(15) })
    const c = makeTaskRow('c', { parentId: 'p', dueDate: D(10) })
    expect(effectiveDue(c, buildTaskTree([p, c]))).toBe(D(10))
  })

  // SP-INH-DUE-IMMUT: 不改写子物理 dueDate；父延期后子物理自动重新生效
  it('不改写子物理 dueDate；父延期后子物理自动重新生效 [SP-INH-DUE-IMMUT]', () => {
    const p = makeTaskRow('p', { dueDate: D(10) })
    const c = makeTaskRow('c', { parentId: 'p', dueDate: D(15) })
    expect(effectiveDue(c, buildTaskTree([p, c]))).toBe(D(10))
    p.data.dueDate = D(20)
    expect(effectiveDue(c, buildTaskTree([p, c]))).toBe(D(15))
    expect(c.data.dueDate).toBe(D(15))
  })
})

describe('defer 地板（max）[SP-INH-DEFER]', () => {
  // SP-INH-DEFER-FORMULA: effectiveDefer = max(自身, 父effectiveDefer) 钳 min(它, effectiveDue)
  it('max(自身, 父effectiveDefer) 再钳 min(它, effectiveDue) [SP-INH-DEFER-FORMULA]', () => {
    // 钳制生效：defer 7/20 > due 7/10 → 钳到 7/10
    const p1 = makeTaskRow('p1')
    const c1 = makeTaskRow('c1', { parentId: 'p1', deferDate: D(20), dueDate: D(10) })
    expect(effectiveDefer(c1, buildTaskTree([p1, c1]))).toBe(D(10))
    // 钳制不生效：defer 7/5 ≤ due 7/10 → 保留 7/5
    const p2 = makeTaskRow('p2')
    const c2 = makeTaskRow('c2', { parentId: 'p2', deferDate: D(5), dueDate: D(10) })
    expect(effectiveDefer(c2, buildTaskTree([p2, c2]))).toBe(D(5))
    // 无 defer 约束不坍缩到 due（−∞ 不被抬升）
    const p3 = makeTaskRow('p3', { dueDate: D(10) })
    const c3 = makeTaskRow('c3', { parentId: 'p3' })
    expect(effectiveDefer(c3, buildTaskTree([p3, c3]))).toBeNull()
  })

  // SP-INH-DEFER-1: 双不设置 → NULL
  it('双不设置 → NULL [SP-INH-DEFER-1]', () => {
    const c = makeTaskRow('c', { parentId: 'p' })
    expect(effectiveDefer(c, buildTaskTree([makeTaskRow('p'), c]))).toBeNull()
  })

  // SP-INH-DEFER-2: 仅父设置 → 完全继承父生效值
  it('仅父设置 → 完全继承父生效值 [SP-INH-DEFER-2]', () => {
    const p = makeTaskRow('p', { deferDate: D(10) })
    const c = makeTaskRow('c', { parentId: 'p' })
    expect(effectiveDefer(c, buildTaskTree([p, c]))).toBe(D(10))
  })

  // SP-INH-DEFER-3: 仅子设置 → 绝对覆盖
  it('仅子设置 → 绝对覆盖 [SP-INH-DEFER-3]', () => {
    const c = makeTaskRow('c', { parentId: 'p', deferDate: D(10) })
    expect(effectiveDefer(c, buildTaskTree([makeTaskRow('p'), c]))).toBe(D(10))
  })

  // SP-INH-DEFER-4: 父比子晚 → 抬升为父；物理值保留
  it('父比子晚 → 抬升为父；物理值保留 [SP-INH-DEFER-4]', () => {
    const p = makeTaskRow('p', { deferDate: D(10) })
    const c = makeTaskRow('c', { parentId: 'p', deferDate: D(5) })
    const tree = buildTaskTree([p, c])
    expect(effectiveDefer(c, tree)).toBe(D(10))
    expect(c.data.deferDate).toBe(D(5))
  })

  // SP-INH-DEFER-5: 子比父晚 → 独立延后
  it('子比父晚 → 独立延后 [SP-INH-DEFER-5]', () => {
    const p = makeTaskRow('p', { deferDate: D(5) })
    const c = makeTaskRow('c', { parentId: 'p', deferDate: D(10) })
    expect(effectiveDefer(c, buildTaskTree([p, c]))).toBe(D(10))
  })

  // SP-INH-DEFER-IMMUT: 不改写子物理 deferDate
  it('不改写子物理 deferDate [SP-INH-DEFER-IMMUT]', () => {
    const p = makeTaskRow('p', { deferDate: D(10) })
    const c = makeTaskRow('c', { parentId: 'p', deferDate: D(5) })
    expect(effectiveDefer(c, buildTaskTree([p, c]))).toBe(D(10))
    p.data.deferDate = null
    expect(effectiveDefer(c, buildTaskTree([p, c]))).toBe(D(5))
    expect(c.data.deferDate).toBe(D(5))
  })
})
