/**
 * 状态联动行为规约（SP-LINK-STATE-*）。
 * 每条 `it` 上方 `// SP-LINK-STATE-N` 与 `wiki/draft/gtd行为规约.md` 一一对应。
 * 四句口诀：完成/搁置父向下、完成/搁置子不上向、重开/恢复父不下向、重开/恢复子向上。
 *
 * 断言对象为 L3 `cascade.ts` 的 plan* 纯函数返回的 `CascadeStep[]`（计划，不执行）。
 * 执行（盖戳/翻状态）由 L5 state-machine `applySteps` 负责，见 SP-STATE-* 行为测试。
 *
 * 不采纳 autoCompleteOnLastChild（完成最后子→自动完成父）——违反「完成子不上向」。
 */
import { describe, expect, it } from 'vitest'
import { EXPLICIT_STATUS } from '../data/types'
import { makeTaskRow } from '../fixtures'
import { buildTaskTree } from '../structure/tree'
import {
  planCompleteCascade,
  planDeleteCascade,
  planDropCascade,
  planReopenCascade,
  planRestoreCascade,
} from './cascade'

/** 把 step 列表投影为 [taskId, targetStatus] 对，便于断言 */
function pairs(steps: ReturnType<typeof planCompleteCascade>) {
  return steps.map(s => [s.taskId, s.targetStatus] as const)
}

describe('状态联动（四句口诀）[SP-LINK-STATE]', () => {
  // SP-LINK-STATE-1: 完成/搁置父 → 向下联动 完成/搁置 所有激活子
  it('complete 父 → 所有 ACTIVE 后代转 COMPLETED（跳过终态后代）[SP-LINK-STATE-1]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.ACTIVE })
    const c1 = makeTaskRow('c1', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const c2 = makeTaskRow('c2', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const cDone = makeTaskRow('c3', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    const cHold = makeTaskRow('c4', { parentId: 'p', status: EXPLICIT_STATUS.HOLD })
    const tree = buildTaskTree([p, c1, c2, cDone, cHold])
    expect(pairs(planCompleteCascade('p', tree))).toEqual([
      ['p', EXPLICIT_STATUS.COMPLETED],
      ['c1', EXPLICIT_STATUS.COMPLETED],
      ['c2', EXPLICIT_STATUS.COMPLETED],
    ])
  })
  it('drop 父 → 所有 ACTIVE 后代转 HOLD（跳过终态后代）[SP-LINK-STATE-1]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.ACTIVE })
    const c1 = makeTaskRow('c1', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const cDone = makeTaskRow('c2', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    const tree = buildTaskTree([p, c1, cDone])
    expect(pairs(planDropCascade('p', tree))).toEqual([
      ['p', EXPLICIT_STATUS.HOLD],
      ['c1', EXPLICIT_STATUS.HOLD],
    ])
  })

  // SP-LINK-STATE-2: 完成/搁置子 → 不向上联动（不自动完成父）
  it('complete 子 → 仅自身，父不在计划内（无 autoCompleteOnLastChild）[SP-LINK-STATE-2]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.ACTIVE })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const tree = buildTaskTree([p, c])
    expect(pairs(planCompleteCascade('c', tree))).toEqual([['c', EXPLICIT_STATUS.COMPLETED]])
  })
  it('drop 子 → 父状态不变（父不在计划内）[SP-LINK-STATE-2]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.ACTIVE })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const tree = buildTaskTree([p, c])
    expect(pairs(planDropCascade('c', tree))).toEqual([['c', EXPLICIT_STATUS.HOLD]])
  })

  // SP-LINK-STATE-3: 重开/恢复父 → 不向下联动
  it('reopen 父 → 仅自身翻 ACTIVE，后代不被联动 [SP-LINK-STATE-3]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    const tree = buildTaskTree([p, c])
    expect(pairs(planReopenCascade('p', tree))).toEqual([['p', EXPLICIT_STATUS.ACTIVE]])
  })
  it('restore 父 → 仅自身翻 ACTIVE，后代不被联动 [SP-LINK-STATE-3]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.HOLD })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.HOLD })
    const tree = buildTaskTree([p, c])
    expect(pairs(planRestoreCascade('p', tree))).toEqual([['p', EXPLICIT_STATUS.ACTIVE]])
  })

  // SP-LINK-STATE-4: 重开/恢复子 → 向上联动链路所有父
  it('reopen 子 → 链路所有 COMPLETED 祖先转 ACTIVE [SP-LINK-STATE-4]', () => {
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.COMPLETED })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.COMPLETED })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    const tree = buildTaskTree([gp, p, c])
    expect(pairs(planReopenCascade('c', tree))).toEqual([
      ['c', EXPLICIT_STATUS.ACTIVE],
      ['p', EXPLICIT_STATUS.ACTIVE],
      ['gp', EXPLICIT_STATUS.ACTIVE],
    ])
  })
  it('restore 子 → 链路所有 HOLD 祖先转 ACTIVE [SP-LINK-STATE-4]', () => {
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.HOLD })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.HOLD })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.HOLD })
    const tree = buildTaskTree([gp, p, c])
    expect(pairs(planRestoreCascade('c', tree))).toEqual([
      ['c', EXPLICIT_STATUS.ACTIVE],
      ['p', EXPLICIT_STATUS.ACTIVE],
      ['gp', EXPLICIT_STATUS.ACTIVE],
    ])
  })

  // SP-LINK-STATE-5: 删除父 → 级联软删后代
  it('delete 父 → 所有后代软删（含 COMPLETED/HOLD 后代）[SP-LINK-STATE-5]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.ACTIVE })
    const c1 = makeTaskRow('c1', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const c2 = makeTaskRow('c2', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    const c3 = makeTaskRow('c3', { parentId: 'p', status: EXPLICIT_STATUS.HOLD })
    const tree = buildTaskTree([p, c1, c2, c3])
    expect(pairs(planDeleteCascade('p', tree))).toEqual([
      ['p', EXPLICIT_STATUS.DELETED],
      ['c1', EXPLICIT_STATUS.DELETED],
      ['c2', EXPLICIT_STATUS.DELETED],
      ['c3', EXPLICIT_STATUS.DELETED],
    ])
  })

  // SP-LINK-STATE-6: 重开翻 COMPLETED 祖先 / 恢复翻 HOLD 祖先，不串扰 + 幂等
  it('reopen 只翻 COMPLETED 祖先，不动 HOLD 祖先 [SP-LINK-STATE-6]', () => {
    // gp(HOLD) → p(COMPLETED) → c(COMPLETED)：reopen c 翻 c+p，不翻 gp(HOLD)
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.HOLD })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.COMPLETED })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    const tree = buildTaskTree([gp, p, c])
    expect(pairs(planReopenCascade('c', tree))).toEqual([
      ['c', EXPLICIT_STATUS.ACTIVE],
      ['p', EXPLICIT_STATUS.ACTIVE],
    ])
  })
  it('restore 只翻 HOLD 祖先，不动 COMPLETED 祖先 [SP-LINK-STATE-6]', () => {
    // gp(COMPLETED) → p(HOLD) → c(HOLD)：restore c 翻 c+p，不翻 gp(COMPLETED)
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.COMPLETED })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.HOLD })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.HOLD })
    const tree = buildTaskTree([gp, p, c])
    expect(pairs(planRestoreCascade('c', tree))).toEqual([
      ['c', EXPLICIT_STATUS.ACTIVE],
      ['p', EXPLICIT_STATUS.ACTIVE],
    ])
  })
  it('级联遇终态后代/祖先跳过（幂等，重放不翻倍）[SP-LINK-STATE-6]', () => {
    // 已全部 COMPLETED 的树：complete 级联重放 → 无 step（无 ACTIVE）
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    const treeComplete = buildTaskTree([p, c])
    expect(planCompleteCascade('p', treeComplete)).toEqual([])
    // 已全部 ACTIVE 的树：reopen 重放 → 无 step（无 COMPLETED）
    const pA = makeTaskRow('p2', { status: EXPLICIT_STATUS.ACTIVE })
    const cA = makeTaskRow('c2', { parentId: 'p2', status: EXPLICIT_STATUS.ACTIVE })
    expect(planReopenCascade('c2', buildTaskTree([pA, cA]))).toEqual([])
    // 已全部 DELETED 的树：delete 重放 → 无 step
    const pD = makeTaskRow('p3', { status: EXPLICIT_STATUS.DELETED })
    const cD = makeTaskRow('c3', { parentId: 'p3', status: EXPLICIT_STATUS.DELETED })
    expect(planDeleteCascade('p3', buildTaskTree([pD, cD]))).toEqual([])
  })
})
