/**
 * 富场景（共享：单测 + 未来 client Storybook）。
 *
 * 每个场景返回 `{ rows, rowStore, now, dueSoonMs }`——`rowStore` 可直接喂
 * `computeAll` / `renderPerspective` / Storybook 视图组件。场景命名聚焦一个语义轴，
 * 便于单测断言该轴行为，也便于 Storybook 故事展示该场景的视觉表现。
 *
 * 设计原则：场景数据稳定可重现（固定 NOW、固定 ISO），不依赖随机（makeTask 的
 * 随机 id 在场景里用固定 id 覆盖）。Storybook 故事与单测同源，避免双份数据漂移。
 */
import type { EntityRow } from '../data/sync-schema'
import { RowStore } from '../data/rows'
import { GROUP_TYPE } from '../data/types'
import { DUE_SOON_MS, isoFromNow, NOW } from './constants'
import { makeTaskRow } from './factories'

export interface Scenario {
  rows: EntityRow[]
  rowStore: RowStore
  now: Date
  dueSoonMs: number
}

function scenario(rows: EntityRow[]): Scenario {
  return { rows, rowStore: new RowStore(rows), now: NOW, dueSoonMs: DUE_SOON_MS }
}

/**
 * 串行组场景：父 SEQUENTIAL + 3 个有序子任务。
 * 前序 ACTIVE 未完成 → 后续 blocked（SP-DEP-SERIAL）。
 */
export function serialGroupScenario(): Scenario {
  const parent = makeTaskRow('seq', { name: '串行组', groupType: GROUP_TYPE.SEQUENTIAL })
  const first = makeTaskRow('seq-1', { name: '第一步', parentId: 'seq', order: 1 })
  const second = makeTaskRow('seq-2', { name: '第二步', parentId: 'seq', order: 2 })
  const third = makeTaskRow('seq-3', { name: '第三步', parentId: 'seq', order: 3 })
  return scenario([parent, first, second, third])
}

/**
 * 可用性混合场景：覆盖终态/墙钟/逾期/临近/可用五态。
 * - overdue：due 在过去
 * - dueSoon：due 在临近阈值内
 * - deferred：defer 在未来 → blocked
 * - completed：终态 → blocked
 * - available：无约束
 */
export function availabilityMixScenario(): Scenario {
  const overdue = makeTaskRow('avail-overdue', { name: '逾期', dueDate: isoFromNow(-86400000) })
  const dueSoon = makeTaskRow('avail-soon', { name: '临近', dueDate: isoFromNow(DUE_SOON_MS / 2) })
  const deferred = makeTaskRow('avail-deferred', { name: '未解锁', deferDate: isoFromNow(60000) })
  const completed = makeTaskRow('avail-done', { name: '已完成', status: 'completed' as const, completedAt: NOW.toISOString() })
  const available = makeTaskRow('avail-free', { name: '可执行' })
  return scenario([overdue, dueSoon, deferred, completed, available])
}
