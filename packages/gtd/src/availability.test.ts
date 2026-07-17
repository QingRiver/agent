import { describe, expect, it } from 'vitest'
import { DUE_SOON_MS, makeDoc, makeProject, makeTask, NOW } from './__tests__/fixtures'
import { computeAll, computeStatus } from './availability'
import { buildTaskTree } from './tree'
import { COMPUTED_STATUS, EXPLICIT_STATUS, GROUP_TYPE } from './types'

describe('computeStatus', () => {
  it('completed 终态→blocked', () => {
    const t = makeTask({ status: EXPLICIT_STATUS.COMPLETED })
    expect(computeStatus(t, NOW, buildTaskTree([t]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.BLOCKED)
  })

  it('deferDate 在未来→blocked', () => {
    const t = makeTask({ deferDate: new Date(NOW.getTime() + 60000).toISOString() })
    expect(computeStatus(t, NOW, buildTaskTree([t]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.BLOCKED)
  })

  it('祖先 project on_hold→blocked', () => {
    const p = makeProject({ id: 'p1', status: EXPLICIT_STATUS.ON_HOLD })
    const t = makeTask({ id: 't1', projectId: 'p1' })
    const doc = makeDoc({ projects: [p], tasks: [t] })
    const tree = buildTaskTree(doc.tasks)
    expect(computeStatus(t, NOW, tree, DUE_SOON_MS, doc.projects)).toBe(COMPUTED_STATUS.BLOCKED)
  })

  it('sequential 前序未完成→blocked', () => {
    const group = makeTask({ id: 'g', groupType: GROUP_TYPE.SEQUENTIAL })
    const first = makeTask({ id: 'a', parentId: 'g', order: 1 })
    const second = makeTask({ id: 'b', parentId: 'g', order: 2 })
    const tree = buildTaskTree([group, first, second])
    expect(computeStatus(second, NOW, tree, DUE_SOON_MS)).toBe(COMPUTED_STATUS.BLOCKED)
  })

  it('dueDate 已过期→overdue', () => {
    const t = makeTask({ dueDate: new Date(NOW.getTime() - 60000).toISOString() })
    expect(computeStatus(t, NOW, buildTaskTree([t]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.OVERDUE)
  })

  it('dueDate 临近→due_soon', () => {
    const t = makeTask({ dueDate: new Date(NOW.getTime() + DUE_SOON_MS / 2).toISOString() })
    expect(computeStatus(t, NOW, buildTaskTree([t]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.DUE_SOON)
  })

  it('无约束→available', () => {
    const t = makeTask()
    expect(computeStatus(t, NOW, buildTaskTree([t]), DUE_SOON_MS)).toBe(COMPUTED_STATUS.AVAILABLE)
  })

  it('祖先 defer 在未来→子项 blocked', () => {
    const parent = makeTask({
      id: 'p',
      groupType: GROUP_TYPE.PARALLEL,
      deferDate: new Date(NOW.getTime() + 60000).toISOString(),
    })
    const child = makeTask({ id: 'c', parentId: 'p' })
    const tree = buildTaskTree([parent, child])
    expect(computeStatus(child, NOW, tree, DUE_SOON_MS)).toBe(COMPUTED_STATUS.BLOCKED)
  })

  it('项目 sequential 前序未完成→blocked', () => {
    const p = makeProject({ id: 'p1', type: GROUP_TYPE.SEQUENTIAL })
    const first = makeTask({ id: 'a', projectId: 'p1', order: 1 })
    const second = makeTask({ id: 'b', projectId: 'p1', order: 2 })
    const tree = buildTaskTree([first, second])
    expect(computeStatus(second, NOW, tree, DUE_SOON_MS, [p])).toBe(COMPUTED_STATUS.BLOCKED)
  })
})

describe('computeAll', () => {
  it('返回所有 task 的派生状态', () => {
    const t1 = makeTask({ id: 'a' })
    const t2 = makeTask({ id: 'b', status: EXPLICIT_STATUS.COMPLETED })
    const all = computeAll(makeDoc({ tasks: [t1, t2] }), NOW, DUE_SOON_MS)
    expect(all.a).toBe(COMPUTED_STATUS.AVAILABLE)
    expect(all.b).toBe(COMPUTED_STATUS.BLOCKED)
  })
})
