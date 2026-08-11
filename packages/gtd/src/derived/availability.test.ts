/**
 * 可用性轴行为规约（SP-AVAIL-* / SP-CLASS-FLAG / SP-DEP-SERIAL / SP-DEP-PARALLEL）。
 * 每条 `it` 上方 `// SP-<id>` 与 `wiki/draft/gtd行为规约.md` 一一对应。
 * 当前实现在 `availability.ts` computeStatus（约束轴 pipeline）。
 * 场景数据来自共享 `./fixtures`（与未来 client Storybook 同源）。
 * 墙钟/overdue/due_soon 轴已切 effective 日期（SP-AVAIL-EFFECTIVE）：父 due 截断子、父 defer 抬升子。
 */
import { describe, expect, it } from 'vitest'
import { COMPUTED_STATUS, EXPLICIT_STATUS, GROUP_TYPE } from '../data/types'
import {
  availabilityMixScenario,
  DUE_SOON_MS,
  isoFromNow,
  makeTaskRow,
  NOW,
  serialGroupScenario,
} from '../fixtures'
import { buildTaskTree } from '../structure/tree'
import { computeAll, computeStatus } from './availability'

describe('可用性轴 [SP-AVAIL]', () => {
  // SP-AVAIL-TERMINAL: 终态 → blocked
  it('completed/hold/deleted → BLOCKED [SP-AVAIL-TERMINAL]', () => {
    const completed = makeTaskRow('t1', { status: EXPLICIT_STATUS.COMPLETED, completedAt: NOW.toISOString() })
    const hold = makeTaskRow('t2', { status: EXPLICIT_STATUS.HOLD, droppedAt: NOW.toISOString() })
    const deleted = makeTaskRow('t3', { status: EXPLICIT_STATUS.DELETED })
    expect(computeStatus(completed, NOW, buildTaskTree([completed]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.BLOCKED)
    expect(computeStatus(hold, NOW, buildTaskTree([hold]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.BLOCKED)
    expect(computeStatus(deleted, NOW, buildTaskTree([deleted]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.BLOCKED)
  })

  // SP-AVAIL-WALLCLOCK: 墙钟未解锁（effectiveDefer > now）→ blocked
  // effectiveDefer = 地板 max(自身∪祖先 defer)；单任务无祖先时 = 自身 raw defer。
  it('defer 在未来 → BLOCKED [SP-AVAIL-WALLCLOCK]', () => {
    const t = makeTaskRow('t1', { deferDate: isoFromNow(60000) })
    expect(computeStatus(t, NOW, buildTaskTree([t]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.BLOCKED)
  })

  // SP-AVAIL-ANCESTOR: 祖先派生 blocked → blocked
  it('父 defer 在未来 → 子 BLOCKED（祖先链）[SP-AVAIL-ANCESTOR]', () => {
    const parent = makeTaskRow('p', { groupType: GROUP_TYPE.PARALLEL, deferDate: isoFromNow(60000) })
    const child = makeTaskRow('c', { parentId: 'p' })
    const tree = buildTaskTree([parent, child])
    expect(computeStatus(child, NOW, tree, DUE_SOON_MS)).toBe(COMPUTED_STATUS.BLOCKED)
  })

  // SP-DEP-SERIAL: 串行父下，前序 sibling ACTIVE → 后续 blocked
  it('串行组前序未完成 → 后续 BLOCKED（场景）[SP-DEP-SERIAL]', () => {
    const { rowStore, now, dueSoonMs } = serialGroupScenario()
    const all = computeAll(rowStore, now, dueSoonMs)
    expect(all['seq-1']).toBe(COMPUTED_STATUS.AVAILABLE) // 前序无阻塞
    expect(all['seq-2']).toBe(COMPUTED_STATUS.BLOCKED) // 前序 seq-1 ACTIVE
    expect(all['seq-3']).toBe(COMPUTED_STATUS.BLOCKED)
  })

  // SP-DEP-PARALLEL: 并行父下，子任务独立不阻塞
  it('并行组子任务彼此独立（不阻塞）[SP-DEP-PARALLEL]', () => {
    const parent = makeTaskRow('par', { groupType: GROUP_TYPE.PARALLEL })
    const a = makeTaskRow('a', { parentId: 'par', order: 1 })
    const b = makeTaskRow('b', { parentId: 'par', order: 2 })
    const tree = buildTaskTree([parent, a, b])
    expect(computeStatus(a, NOW, tree, DUE_SOON_MS)).toBe(COMPUTED_STATUS.AVAILABLE)
    expect(computeStatus(b, NOW, tree, DUE_SOON_MS)).toBe(COMPUTED_STATUS.AVAILABLE)
  })

  // SP-AVAIL-OVERDUE: effectiveDue 过期 → overdue
  // effectiveDue = 天花板 min(自身∪祖先 due)；单任务无祖先时 = 自身 raw due。
  it('due 已过期 → OVERDUE [SP-AVAIL-OVERDUE]', () => {
    const t = makeTaskRow('t1', { dueDate: isoFromNow(-60000) })
    expect(computeStatus(t, NOW, buildTaskTree([t]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.OVERDUE)
  })

  // SP-AVAIL-DUE-SOON: effectiveDue 临近 → due_soon
  it('due 临近 → DUE_SOON [SP-AVAIL-DUE-SOON]', () => {
    const t = makeTaskRow('t1', { dueDate: isoFromNow(DUE_SOON_MS / 2) })
    expect(computeStatus(t, NOW, buildTaskTree([t]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.DUE_SOON)
  })

  // 综合场景：availabilityMixScenario 五态各就位
  it('综合场景 availabilityMix 五态覆盖 [SP-AVAIL]', () => {
    const { rowStore, now, dueSoonMs } = availabilityMixScenario()
    const all = computeAll(rowStore, now, dueSoonMs)
    expect(all['avail-overdue']).toBe(COMPUTED_STATUS.OVERDUE)
    expect(all['avail-soon']).toBe(COMPUTED_STATUS.DUE_SOON)
    expect(all['avail-deferred']).toBe(COMPUTED_STATUS.BLOCKED)
    expect(all['avail-done']).toBe(COMPUTED_STATUS.BLOCKED)
    expect(all['avail-free']).toBe(COMPUTED_STATUS.AVAILABLE)
  })

  // SP-CLASS-FLAG: 旗标不改状态，只提高可见优先级
  it('flagged 不改变 ComputedStatus（仍 AVAILABLE）[SP-CLASS-FLAG]', () => {
    const t = makeTaskRow('t1', { flagged: true })
    expect(computeStatus(t, NOW, buildTaskTree([t]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.AVAILABLE)
  })

  // SP-AVAIL-EFFECTIVE: 墙钟/过期/临近均用 effective 日期（父子继承）
  it('父 due 截断子（天花板）：子 raw due 在未来但父 due 已过 → 子 OVERDUE [SP-AVAIL-EFFECTIVE]', () => {
    const parent = makeTaskRow('p', { groupType: GROUP_TYPE.PARALLEL, dueDate: isoFromNow(-60000) })
    const child = makeTaskRow('c', { parentId: 'p', dueDate: isoFromNow(60000) })
    // 子 raw due 未来，但 effectiveDue = min(子未来, 父过去) = 父过去 → OVERDUE
    expect(computeStatus(child, NOW, buildTaskTree([parent, child]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.OVERDUE)
  })
  it('父 defer 抬升子（地板）：子 raw defer 已过但父 defer 在未来 → 子 BLOCKED [SP-AVAIL-EFFECTIVE]', () => {
    const parent = makeTaskRow('p', { groupType: GROUP_TYPE.PARALLEL, deferDate: isoFromNow(60000) })
    const child = makeTaskRow('c', { parentId: 'p', deferDate: isoFromNow(-60000) })
    // 子 raw defer 过去，但 effectiveDefer = max(子过去, 父未来) = 父未来 → 墙钟未解锁 → BLOCKED
    expect(computeStatus(child, NOW, buildTaskTree([parent, child]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.BLOCKED)
  })
})
