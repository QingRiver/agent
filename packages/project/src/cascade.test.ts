import { describe, expect, it } from 'vitest'
import { makeDir, renameDir } from './dir'
import { movedProjectId } from './tree'
import { recomputeSubtreeVdirs } from './vdir'

const NOW = '2026-08-06T00:00:00.000Z'

// 两个 project + p1 下 d1 > d2 子树
function setup() {
  const p1 = makeDir({ id: 'p1', parentId: null, kind: 'project', name: 'Proj1', ownerId: 'u', now: NOW })
  const p2 = makeDir({ id: 'p2', parentId: null, kind: 'project', name: 'Proj2', ownerId: 'u', now: NOW })
  const d1 = makeDir({ id: 'd1', parentId: 'p1', kind: 'dir', name: 'a', ownerId: 'u', now: NOW, projectId: 'p1', parentVdir: p1.vdir })
  const d2 = makeDir({ id: 'd2', parentId: 'd1', kind: 'dir', name: 'b', ownerId: 'u', now: NOW, projectId: 'p1', parentVdir: d1.vdir })
  return { p1, p2, d1, d2 }
}

describe('§7.1 级联：rename 不动结构', () => {
  it('rename 仅重算子树 vdir，parentId/projectId 全等改前', () => {
    const { p1, d1, d2 } = setup()
    const beforeParent = new Map([[d1.id, d1.parentId], [d2.id, d2.parentId]])
    const beforeProject = new Map([[d1.id, d1.projectId], [d2.id, d2.projectId]])

    // rename d1 → 'A2'：只调 renameDir + recomputeSubtreeVdirs，不动 parentId/projectId
    const renamedRoot = renameDir(d1, 'A2', NOW)
    const vdirs = recomputeSubtreeVdirs([renamedRoot, d2], p1.vdir)

    expect(vdirs.get('d1')).toBe('Proj1/A2')
    expect(vdirs.get('d2')).toBe('Proj1/A2/b')
    // 结构不变（核心契约：rename 不改 parentId/projectId）
    expect(renamedRoot.parentId).toBe(beforeParent.get('d1'))
    expect(renamedRoot.projectId).toBe(beforeProject.get('d1'))
    expect(d2.parentId).toBe(beforeParent.get('d2'))
    expect(d2.projectId).toBe(beforeProject.get('d2'))
  })
})

describe('§7.1 级联：move 重算子树 vdir', () => {
  it('move 后子树 vdir 接到新父 vdir（结构与父归属随 move 改）', () => {
    const { p2, d1, d2 } = setup()
    // move d1 到 p2 下：d1.parentId → p2，新父 vdir = p2.vdir
    const vdirs = recomputeSubtreeVdirs([d1, d2], p2.vdir)
    expect(vdirs.get('d1')).toBe('Proj2/a')
    expect(vdirs.get('d2')).toBe('Proj2/a/b')
    // 与原 p1 下的 vdir 不同
    expect(vdirs.get('d1')).not.toBe(d1.vdir)
  })
})

describe('§7.1 级联：跨 project move 才翻新 projectId', () => {
  it('跨 project move → movedProjectId 返回新根', () => {
    const { p1, p2 } = setup()
    expect(movedProjectId(p1.id, p2.id)).toBe('p2')
  })

  it('同 project move → movedProjectId 返回 null（不动）', () => {
    const { p1 } = setup()
    expect(movedProjectId(p1.id, p1.id)).toBeNull()
  })

  it('跨 project move 后子树 dirs + 挂载实体 projectId 全翻新', () => {
    const { p1, p2, d1, d2 } = setup()
    // 模拟 service 层：跨 project move 时把子树所有 dir.projectId 翻新
    const newPid = movedProjectId(p1.id, p2.id)!
    const updated = [d1, d2].map(d => ({ ...d, projectId: newPid }))
    expect(updated[0]!.projectId).toBe('p2')
    expect(updated[1]!.projectId).toBe('p2')
    // 挂载实体（task/doc）同样翻新
    const task = { id: 't1', mountDirId: 'd1', projectId: 'p1' }
    const movedTask = { ...task, projectId: newPid }
    expect(movedTask.projectId).toBe('p2')
  })

  it('同 project move 后 projectId 不动', () => {
    const { p1, d1, d2 } = setup()
    const newPid = movedProjectId(p1.id, p1.id)
    expect(newPid).toBeNull()
    // 同 project move：d1/d2 projectId 保持 p1
    expect(d1.projectId).toBe('p1')
    expect(d2.projectId).toBe('p1')
  })
})
