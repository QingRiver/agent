/**
 * 状态联动行为规约（SP-LINK-STATE-*）。
 * 每条 `it` 上方 `// SP-LINK-STATE-N` 与 `wiki/draft/gtd行为规约.md` / `wiki/GTD_New.md` 一一对应。
 * 四句口诀：完成/搁置父时子的有效状态跟随父；完成/搁置子不向上拉回父；重开/恢复子向上拉回——把链路上已完成/搁置的祖先翻回活跃（祖先是搁置或删除时不向上翻）。
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
  planPurgeCascade,
  planReopenCascade,
  planRestoreCascade,
  planRestoreFromTrashCascade,
  planUpwardActivation,
} from './cascade'

/** 把 step 列表投影为 [taskId, targetStatus] 对，便于断言 */
function pairs(steps: ReturnType<typeof planCompleteCascade>) {
  return steps.map(s => [s.taskId, s.targetStatus] as const)
}

describe('状态联动（四句口诀）[SP-LINK-STATE]', () => {
  // SP-LINK-STATE-1: 完成/搁置父 → 不改子任务自身状态（新模型：完成/搁置时子的有效状态跟随父，子任务自身状态保真）
  it('完成父 → 不改子任务自身状态（plan 恒空，自身由命令写；完成时子的有效状态跟随父在 effectiveStatus 派生层）[SP-LINK-STATE-1]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.ACTIVE })
    const c1 = makeTaskRow('c1', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const c2 = makeTaskRow('c2', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const cDone = makeTaskRow('c3', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    const cHold = makeTaskRow('c4', { parentId: 'p', status: EXPLICIT_STATUS.HOLD })
    const tree = buildTaskTree([p, c1, c2, cDone, cHold])
    // 父完成时子有效状态跟随完成（在 effectiveStatus 派生层子有效变完成，不改子任务自身状态）；plan 恒空（自身由 completeTask 命令写）
    expect(planCompleteCascade('p', tree)).toEqual([])
  })
  it('搁置父 → 不改子任务自身状态（plan 恒空；搁置时子的有效状态跟随父，子任务自身状态保真）[SP-LINK-STATE-1]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.ACTIVE })
    const c1 = makeTaskRow('c1', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const cDone = makeTaskRow('c2', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    const tree = buildTaskTree([p, c1, cDone])
    expect(planDropCascade('p', tree)).toEqual([])
  })

  // SP-LINK-STATE-2: 完成/搁置子 → 不向上联动（不自动完成父）；plan 恒空
  it('complete 子 → plan 恒空（自身由命令写，父不在计划内）[SP-LINK-STATE-2]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.ACTIVE })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const tree = buildTaskTree([p, c])
    expect(planCompleteCascade('c', tree)).toEqual([])
  })
  it('drop 子 → plan 恒空（自身由命令写，父不在计划内）[SP-LINK-STATE-2]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.ACTIVE })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const tree = buildTaskTree([p, c])
    expect(planDropCascade('c', tree)).toEqual([])
  })

  // SP-LINK-STATE-3: 重开/恢复子 → 向上联动（把链路上已完成/搁置的祖先翻回活跃）；不改子任务自身状态
  it('reopen 父 → 仅自身翻 ACTIVE，后代不被向下联动 [SP-LINK-STATE-3]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    const tree = buildTaskTree([p, c])
    expect(pairs(planReopenCascade('p', tree))).toEqual([['p', EXPLICIT_STATUS.ACTIVE]])
  })
  it('restore 父 → 仅自身翻 ACTIVE，后代不被向下联动 [SP-LINK-STATE-3]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.HOLD })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.HOLD })
    const tree = buildTaskTree([p, c])
    expect(pairs(planRestoreCascade('p', tree))).toEqual([['p', EXPLICIT_STATUS.ACTIVE]])
  })
  it('reopen 子 → 向上翻 COMPLETED 祖先链（父/祖父都→ACTIVE）[SP-LINK-STATE-3]', () => {
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
  it('重开子 → 搁置的祖先挡住，只翻自身（不翻搁置/完成祖先）[SP-LINK-STATE-3]', () => {
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.COMPLETED })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.HOLD })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    const tree = buildTaskTree([gp, p, c])
    // p 物理搁置挡住 → c 有效变搁置，拉回不触发；只翻 c 自身，p/gp 不动
    expect(pairs(planReopenCascade('c', tree))).toEqual([
      ['c', EXPLICIT_STATUS.ACTIVE],
    ])
  })
  it('恢复子 → 搁置的祖先挡住，只翻自身（不翻搁置祖先）[SP-LINK-STATE-3]', () => {
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.HOLD })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.HOLD })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.HOLD })
    const tree = buildTaskTree([gp, p, c])
    // gp/p 搁置挡住 → 拉回不触发；只翻 c 自身
    expect(pairs(planRestoreCascade('c', tree))).toEqual([
      ['c', EXPLICIT_STATUS.ACTIVE],
    ])
  })

  // SP-LINK-STATE-5: 删除父 → 只写自身删除，不改子任务自身状态（删除时子的有效状态跟随父，子任务自身状态保真）
  it('删除父 → 只写自身删除，不改子任务自身状态（删除时子的有效状态跟随父，子任务自身状态保真）[SP-LINK-STATE-5]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.ACTIVE })
    const c1 = makeTaskRow('c1', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const c2 = makeTaskRow('c2', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    const c3 = makeTaskRow('c3', { parentId: 'p', status: EXPLICIT_STATUS.HOLD })
    const tree = buildTaskTree([p, c1, c2, c3])
    expect(pairs(planDeleteCascade('p', tree))).toEqual([
      ['p', EXPLICIT_STATUS.DELETED],
    ])
  })

  // 幂等：重放不翻倍
  it('联动遇终态/已达目标态跳过（幂等，重放不翻倍）[SP-LINK-STATE]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    const treeComplete = buildTaskTree([p, c])
    expect(planCompleteCascade('p', treeComplete)).toEqual([])
    expect(pairs(planReopenCascade('c', treeComplete))).toEqual([
      ['c', EXPLICIT_STATUS.ACTIVE],
      ['p', EXPLICIT_STATUS.ACTIVE],
    ])
    const pA = makeTaskRow('p2', { status: EXPLICIT_STATUS.ACTIVE })
    const cA = makeTaskRow('c2', { parentId: 'p2', status: EXPLICIT_STATUS.ACTIVE })
    expect(planReopenCascade('c2', buildTaskTree([pA, cA]))).toEqual([])
    const pD = makeTaskRow('p3', { status: EXPLICIT_STATUS.DELETED })
    const cD = makeTaskRow('c3', { parentId: 'p3', status: EXPLICIT_STATUS.DELETED })
    expect(planDeleteCascade('p3', buildTaskTree([pD, cD]))).toEqual([])
  })

  it('移出回收站仅自身 DELETED→ACTIVE（根无祖先；向下不联动子）', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.DELETED })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.DELETED })
    expect(pairs(planRestoreFromTrashCascade('p', buildTaskTree([p, c])))).toEqual([
      ['p', EXPLICIT_STATUS.ACTIVE],
    ])
  })
  it('移出回收站子 → 删除的祖先挡住，只翻自身（救子不连带救父出回收站）[SP-LINK-STATE-3]', () => {
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.DELETED })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.DELETED })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.DELETED })
    // 回收站绝对性：救子不连带救父；gp/p 删除挡住，只翻 c 自身
    expect(pairs(planRestoreFromTrashCascade('c', buildTaskTree([gp, p, c])))).toEqual([
      ['c', EXPLICIT_STATUS.ACTIVE],
    ])
  })
  it('移出回收站子 → 搁置的祖先挡住，只翻自身 [SP-LINK-STATE-3]', () => {
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.COMPLETED })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.HOLD })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.DELETED })
    // p 搁置挡住 → 只翻 c 自身，p/gp 不动
    expect(pairs(planRestoreFromTrashCascade('c', buildTaskTree([gp, p, c])))).toEqual([
      ['c', EXPLICIT_STATUS.ACTIVE],
    ])
  })
})

/**
 * 向上拉回 planUpwardActivation 行为规约（SP-PULLBACK）。
 * 对应 wiki/GTD.md「统一拉回函数 planUpwardActivation」：
 * 子孙有效变活跃 → 翻路径上物理完成祖先；祖先是搁置或删除时不拉回；不含自身。
 */
describe('向上拉回 planUpwardActivation [SP-PULLBACK]', () => {
  // SP-PULLBACK-1: 翻物理 COMPLETED 祖先（不含自身）
  it('翻路径上物理 COMPLETED 祖先，不含自身 [SP-PULLBACK-1]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    expect(pairs(planUpwardActivation('c', buildTaskTree([p, c])))).toEqual([
      ['p', EXPLICIT_STATUS.ACTIVE],
    ])
  })
  it('多代 COMPLETED 祖先全翻 [SP-PULLBACK-1]', () => {
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.COMPLETED })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.COMPLETED })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    expect(pairs(planUpwardActivation('c', buildTaskTree([gp, p, c])))).toEqual([
      ['p', EXPLICIT_STATUS.ACTIVE],
      ['gp', EXPLICIT_STATUS.ACTIVE],
    ])
  })
  it('遇 ACTIVE 祖先跳过，继续翻更上 COMPLETED [SP-PULLBACK-1]', () => {
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.COMPLETED })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.ACTIVE })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    expect(pairs(planUpwardActivation('c', buildTaskTree([gp, p, c])))).toEqual([
      ['gp', EXPLICIT_STATUS.ACTIVE],
    ])
  })

  // SP-PULLBACK-2: 被搁置的祖先挡住 → 不拉回（搁置绝对性）
  it('搁置的祖先挡住 → 不拉回 [SP-PULLBACK-2]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED })
    const c1 = makeTaskRow('c1', { parentId: 'p', status: EXPLICIT_STATUS.HOLD })
    const c2 = makeTaskRow('c2', { parentId: 'c1', status: EXPLICIT_STATUS.ACTIVE })
    expect(planUpwardActivation('c2', buildTaskTree([p, c1, c2]))).toEqual([])
  })
  it('hOLD 在 COMPLETED 之上 → 不翻其下 COMPLETED [SP-PULLBACK-2]', () => {
    const h = makeTaskRow('h', { status: EXPLICIT_STATUS.HOLD })
    const m = makeTaskRow('m', { parentId: 'h', status: EXPLICIT_STATUS.COMPLETED })
    const c = makeTaskRow('c', { parentId: 'm', status: EXPLICIT_STATUS.ACTIVE })
    expect(planUpwardActivation('c', buildTaskTree([h, m, c]))).toEqual([])
  })

  // SP-PULLBACK-3: 被删除的祖先挡住 → 不拉回（回收站绝对性）
  it('删除的祖先挡住 → 不拉回 [SP-PULLBACK-3]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.COMPLETED })
    const c1 = makeTaskRow('c1', { parentId: 'p', status: EXPLICIT_STATUS.DELETED })
    const c2 = makeTaskRow('c2', { parentId: 'c1', status: EXPLICIT_STATUS.ACTIVE })
    expect(planUpwardActivation('c2', buildTaskTree([p, c1, c2]))).toEqual([])
  })

  // SP-PULLBACK-4: 幂等——无 COMPLETED 祖先 → 空
  it('无 COMPLETED 祖先 → 空（幂等） [SP-PULLBACK-4]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.ACTIVE })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    expect(planUpwardActivation('c', buildTaskTree([p, c]))).toEqual([])
  })
})

/**
 * purge（清空回收站 / 永久销毁）连带物理删子行为规约（SP-PURGE）。
 * 对应 wiki/GTD.md「purge 连带删子」：delete 不改子任务自身状态（自身状态保真），故 purge(T) 必须连带
 * 物理删除所有 effective deleted 后代，否则子失去 deleted 父覆盖会复活。
 */
describe('purge 连带物理删子 [SP-PURGE]', () => {
  // SP-PURGE-1: purge 回收站项 T → T + 所有 effective deleted 后代（含自身状态保真子）
  it('purge(deleted T) → T + 自身状态保真子（active/completed）一并物理删除 [SP-PURGE-1]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.DELETED })
    const c1 = makeTaskRow('c1', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const c2 = makeTaskRow('c2', { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED })
    const tree = buildTaskTree([p, c1, c2])
    // c1/c2 自身状态保真但有效状态跟随 p 删除 → 都有效变删除 → purge 连带删
    expect(planPurgeCascade('p', tree).sort()).toEqual(['c1', 'c2', 'p'])
  })
  it('purge(deleted T) 多代 → 整个子树全删 [SP-PURGE-1]', () => {
    const gp = makeTaskRow('gp', { status: EXPLICIT_STATUS.DELETED })
    const p = makeTaskRow('p', { parentId: 'gp', status: EXPLICIT_STATUS.HOLD })
    const c = makeTaskRow('c', { parentId: 'p', status: EXPLICIT_STATUS.ACTIVE })
    const tree = buildTaskTree([gp, p, c])
    // gp 删除时子的有效状态跟随 gp → p/c 有效变删除 → 全删
    expect(planPurgeCascade('gp', tree).sort()).toEqual(['c', 'gp', 'p'])
  })

  // SP-PURGE-2: 非回收站项（非 DELETED）不可 purge
  it('purge(active T) → 空（非回收站项不可 purge） [SP-PURGE-2]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.ACTIVE })
    const c = makeTaskRow('c', { parentId: 'p' })
    expect(planPurgeCascade('p', buildTaskTree([p, c]))).toEqual([])
  })

  // SP-PURGE-3: 不波及非子树节点
  it('purge(deleted T) 不波及非子树节点 [SP-PURGE-3]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.DELETED })
    const c = makeTaskRow('c', { parentId: 'p' })
    const other = makeTaskRow('other', { status: EXPLICIT_STATUS.ACTIVE })
    const tree = buildTaskTree([p, c, other])
    expect(planPurgeCascade('p', tree).sort()).toEqual(['c', 'p'])
  })

  // SP-PURGE-4: 删除优先于中间搁置 → 搁置子树也有效变删除 → 全删
  it('purge 删除项 T 中间搁置不挡住删除的有效状态跟随 → 搁置子树也删 [SP-PURGE-4]', () => {
    const p = makeTaskRow('p', { status: EXPLICIT_STATUS.DELETED })
    const m = makeTaskRow('m', { parentId: 'p', status: EXPLICIT_STATUS.HOLD })
    const c = makeTaskRow('c', { parentId: 'm', status: EXPLICIT_STATUS.ACTIVE })
    const tree = buildTaskTree([p, m, c])
    // p 删除优先于 m 搁置 → m/c 有效变删除 → 全删
    expect(planPurgeCascade('p', tree).sort()).toEqual(['c', 'm', 'p'])
  })
})
