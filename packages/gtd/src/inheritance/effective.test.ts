/**
 * 父子时间继承行为规约（SP-INH-*）。
 * 每条 `it` 上方 `// SP-INH-*` 与 `wiki/draft/gtd行为规约.md` 一一对应。
 * PlanDate 为 OF4 coalesce 继承（跑绿）；Due/Defer effective 派生已落地（跑绿）。
 * SP-INV-REPEAT-REOPEN（L5 reopenTask throw）归 command/state.test.ts SP-STATE-3，此处不重复。
 */
import { describe, expect, it } from 'vitest'
import { COMPUTED_STATUS, EXPLICIT_STATUS, PLANNED_MODE } from '../data/types'
import { computeStatus } from '../derived/availability'
import { DUE_SOON_MS, makeTaskRow, NOW } from '../fixtures'
import { buildTaskTree } from '../structure/tree'
import {
  effectiveDefer,
  effectiveDue,
  effectivePlannedDate,
  effectivePlannedMode,
  effectiveStatus,
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

  // SP-INH-PLAN-ROLLING: 子 rolling 不继承父日期；父 rolling 无日期可继
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

/**
 * 有效状态继承行为规约（SP-INH-STATUS）。
 * 对应 wiki/GTD.md「有效状态」mermaid：deleted 最优先 + hold/completed 从根向下路径首个决定（完成时子的有效状态跟随父）。
 */
describe('有效状态继承 [SP-INH-STATUS]', () => {
  // SP-INH-STATUS-1: 自身物理无祖先覆盖 → effective = 自身物理
  it('自身 active 无覆盖 → active [SP-INH-STATUS-1]', () => {
    const t = makeTaskRow('t', { status: EXPLICIT_STATUS.ACTIVE })
    expect(effectiveStatus(t, buildTaskTree([t]))).toBe(EXPLICIT_STATUS.ACTIVE)
  })
  it('自身完成无覆盖 → 完成（无覆盖时用自身状态） [SP-INH-STATUS-1]', () => {
    const t = makeTaskRow('t', { status: EXPLICIT_STATUS.COMPLETED })
    expect(effectiveStatus(t, buildTaskTree([t]))).toBe(EXPLICIT_STATUS.COMPLETED)
  })
  it('自身 hold 无覆盖 → hold [SP-INH-STATUS-1]', () => {
    const t = makeTaskRow('t', { status: EXPLICIT_STATUS.HOLD })
    expect(effectiveStatus(t, buildTaskTree([t]))).toBe(EXPLICIT_STATUS.HOLD)
  })
  it('自身 deleted → deleted [SP-INH-STATUS-1]', () => {
    const t = makeTaskRow('t', { status: EXPLICIT_STATUS.DELETED })
    expect(effectiveStatus(t, buildTaskTree([t]))).toBe(EXPLICIT_STATUS.DELETED)
  })

  // SP-INH-STATUS-2: 祖先 deleted 时子有效跟随 deleted，优先于自身 hold/completed/active
  it('祖先 deleted 盖自身 hold → deleted（回收站优先于搁置） [SP-INH-STATUS-2]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.DELETED })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.HOLD })
    expect(effectiveStatus(c, buildTaskTree([p, c]))).toBe(EXPLICIT_STATUS.DELETED)
  })
  it('祖先 deleted 盖自身 completed → deleted [SP-INH-STATUS-2]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.DELETED })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    expect(effectiveStatus(c, buildTaskTree([p, c]))).toBe(EXPLICIT_STATUS.DELETED)
  })

  // SP-INH-STATUS-3: 祖先 hold 时子有效跟随 hold，优先于自身 completed/active
  it('祖先搁置优先于自身完成 → 有效搁置（搁置的祖先挡住子的完成） [SP-INH-STATUS-3]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.HOLD })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    expect(effectiveStatus(c, buildTaskTree([p, c]))).toBe(EXPLICIT_STATUS.HOLD)
    // 自身状态保真：子的物理 completed 不被改写
    expect(c.data.status).toBe(EXPLICIT_STATUS.COMPLETED)
  })
  it('祖先 hold 盖自身 active → hold [SP-INH-STATUS-3]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.HOLD })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    expect(effectiveStatus(c, buildTaskTree([p, c]))).toBe(EXPLICIT_STATUS.HOLD)
  })

  // SP-INH-STATUS-4: 完成向下传递——COMPLETED 祖先使子有效变 completed（自身状态保真）
  it('父完成+子活跃 → 子有效完成（子的有效状态跟随父的完成） [SP-INH-STATUS-4]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    expect(effectiveStatus(c, buildTaskTree([p, c]))).toBe(EXPLICIT_STATUS.COMPLETED)
    // 自身状态保真：子的物理 active 不被改写
    expect(c.data.status).toBe(EXPLICIT_STATUS.ACTIVE)
  })
  it('多代完成：祖父完成+孙活跃 → 孙有效完成（子的有效状态跟随父的完成） [SP-INH-STATUS-4]', () => {
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.COMPLETED })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.COMPLETED })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    expect(effectiveStatus(c, buildTaskTree([gp, p, c]))).toBe(EXPLICIT_STATUS.COMPLETED)
  })
  it('祖父完成+父搁置+子活跃 → 父和子都有效完成（祖父的完成优先于父的搁置） [SP-INH-STATUS-4]', () => {
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.COMPLETED })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.HOLD })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const tree = buildTaskTree([gp, p, c])
    // 根 gp completed 最靠根决定子有效状态：P 自身 hold、C active 在 effective 层均变 completed
    expect(effectiveStatus(p, tree)).toBe(EXPLICIT_STATUS.COMPLETED)
    expect(effectiveStatus(c, tree)).toBe(EXPLICIT_STATUS.COMPLETED)
    // 自身状态保真：P hold / C active 不被改写
    expect(p.data.status).toBe(EXPLICIT_STATUS.HOLD)
    expect(c.data.status).toBe(EXPLICIT_STATUS.ACTIVE)
  })
  it('祖父搁置+父完成+子活跃 → 父和子都有效搁置（祖父的搁置优先于父的完成） [SP-INH-STATUS-4]', () => {
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.HOLD })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.COMPLETED })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const tree = buildTaskTree([gp, p, c])
    expect(effectiveStatus(p, tree)).toBe(EXPLICIT_STATUS.HOLD)
    expect(effectiveStatus(c, tree)).toBe(EXPLICIT_STATUS.HOLD)
    expect(p.data.status).toBe(EXPLICIT_STATUS.COMPLETED)
    expect(c.data.status).toBe(EXPLICIT_STATUS.ACTIVE)
  })

  // SP-INH-STATUS-5: 回收站优先于搁置（祖先链 deleted + hold）
  it('祖先删除+中间搁置 → 有效删除（删除优先于搁置） [SP-INH-STATUS-5]', () => {
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.DELETED })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.HOLD })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    expect(effectiveStatus(c, buildTaskTree([gp, p, c]))).toBe(EXPLICIT_STATUS.DELETED)
  })

  // SP-INH-STATUS-6: 三层继承（OF 直接子判定依据）父→子1(hold)→子2(active)
  it('父活跃→子1搁置→子2活跃 → 子2有效搁置（子2有效状态跟随子1搁置） [SP-INH-STATUS-6]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.ACTIVE })
    const c1 = makeTaskRow('c1', { parentId: 'p', status: EXPLICIT_STATUS.HOLD })
    const c2 = makeTaskRow('c2', { parentId: 'c1', status: EXPLICIT_STATUS.ACTIVE })
    const tree = buildTaskTree([p, c1, c2])
    expect(effectiveStatus(c2, tree)).toBe(EXPLICIT_STATUS.HOLD)
    // C2 物理活跃保留（待 C1 继续时还原）
    expect(c2.data.status).toBe(EXPLICIT_STATUS.ACTIVE)
  })
})
