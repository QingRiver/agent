import { describe, expect, it } from 'vitest'
import { EXPLICIT_STATUS } from '../data/types'
import { makeTaskRow } from '../fixtures'
import { buildTaskTree } from '../structure/tree'
import { suppressingAncestor } from './restore-targets'

function treeOf(
  ids: string[],
  overrides: Record<string, { status?: typeof EXPLICIT_STATUS[keyof typeof EXPLICIT_STATUS], parentId?: string | null }> = {},
) {
  const rows = ids.map(id => makeTaskRow(id, overrides[id] ?? {}))
  return { rows, tree: buildTaskTree(rows) }
}

describe('suppressingAncestor — 被压制子的最近物理终态压制祖先', () => {
  it('未被压制（effective === 物理 active）→ null', () => {
    const { rows, tree } = treeOf(['t'], { t: { status: EXPLICIT_STATUS.ACTIVE } })
    expect(suppressingAncestor(rows[0]!, tree)).toBeNull()
  })

  it('自身物理终态（未被祖先压）→ null', () => {
    const { rows, tree } = treeOf(['t'], { t: { status: EXPLICIT_STATUS.COMPLETED } })
    expect(suppressingAncestor(rows[0]!, tree)).toBeNull()
  })

  it('自身活跃、父完成 → 返回父（子的有效状态跟随父完成）', () => {
    const { rows, tree } = treeOf(['p', 'c'], {
      p: { status: EXPLICIT_STATUS.COMPLETED },
      c: { parentId: 'p' },
    })
    const c = rows.find(r => r.id === 'c')!
    expect(suppressingAncestor(c, tree)?.id).toBe('p')
  })

  it('自身活跃、父搁置 → 返回父（子的有效状态跟随父搁置）', () => {
    const { rows, tree } = treeOf(['p', 'c'], {
      p: { status: EXPLICIT_STATUS.HOLD },
      c: { parentId: 'p' },
    })
    const c = rows.find(r => r.id === 'c')!
    expect(suppressingAncestor(c, tree)?.id).toBe('p')
  })

  it('自身活跃、父删除 → 返回父（子的有效状态跟随父删除）', () => {
    const { rows, tree } = treeOf(['p', 'c'], {
      p: { status: EXPLICIT_STATUS.DELETED },
      c: { parentId: 'p' },
    })
    const c = rows.find(r => r.id === 'c')!
    expect(suppressingAncestor(c, tree)?.id).toBe('p')
  })

  it('多代完成：祖父完成→父(活跃)→孙(活跃)，点孙返回祖父（决定子有效状态的最靠根完成祖先）', () => {
    const { rows, tree } = treeOf(['gp', 'p', 'c'], {
      gp: { status: EXPLICIT_STATUS.COMPLETED },
      p: { parentId: 'gp' }, // 物理 ACTIVE，有效 completed（子的有效状态跟随 gp 完成）
      c: { parentId: 'p' }, // 物理 ACTIVE，有效 completed
    })
    const c = rows.find(r => r.id === 'c')!
    // C effective=completed；决定子有效状态的最靠根祖先=GP（根方向首个 completed）
    expect(suppressingAncestor(c, tree)?.id).toBe('gp')
  })

  it('多代同态完成：祖父完成+父完成+子活跃 → 返回祖父（决定子有效状态的最靠根祖先，而非最近的父）', () => {
    const { rows, tree } = treeOf(['gp', 'p', 'c'], {
      gp: { status: EXPLICIT_STATUS.COMPLETED },
      p: { parentId: 'gp', status: EXPLICIT_STATUS.COMPLETED },
      c: { parentId: 'p' }, // 物理 ACTIVE，有效 completed
    })
    const c = rows.find(r => r.id === 'c')!
    // C effective=completed；决定子有效状态的最靠根祖先=GP（根方向首个 completed），非 P（最近）——固化最靠根方向
    expect(suppressingAncestor(c, tree)?.id).toBe('gp')
  })

  it('优先级 DELETED>HOLD：GP deleted + P hold + C active → C effective deleted，压制源 GP', () => {
    const { rows, tree } = treeOf(['gp', 'p', 'c'], {
      gp: { status: EXPLICIT_STATUS.DELETED },
      p: { parentId: 'gp', status: EXPLICIT_STATUS.HOLD },
      c: { parentId: 'p' }, // 物理 active，有效 deleted（deleted 优先于 hold，子的有效状态跟随 gp）
    })
    const c = rows.find(r => r.id === 'c')!
    // C effective=deleted；祖先链 [P(hold≠deleted), GP(deleted)] → 返回 GP
    expect(suppressingAncestor(c, tree)?.id).toBe('gp')
  })

  it('被压制子自身物理 completed（被更强 hold 祖先压成 effective hold）→ 返回 hold 祖先', () => {
    const { rows, tree } = treeOf(['p', 'c'], {
      p: { status: EXPLICIT_STATUS.HOLD },
      c: { parentId: 'p', status: EXPLICIT_STATUS.COMPLETED }, // 物理 completed，有效 hold（被父 hold 压）
    })
    const c = rows.find(r => r.id === 'c')!
    expect(suppressingAncestor(c, tree)?.id).toBe('p')
  })
})
