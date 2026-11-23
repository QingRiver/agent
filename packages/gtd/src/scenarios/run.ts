import type { EntityRow, EntityRowOf } from '../data/row-schema'
import type { Op, OpIds } from '../op'
import { applyOps } from '../apply'
import { GtdModel } from '../state/model'
import {
  buildTaskTree,
  effectiveDefer,
  effectiveDue,
  effectivePlannedDate,
  effectivePlannedMode,
  effectiveStatus,
} from '../state/tree'

export function stamp(): OpIds {
  let n = 0
  return {
    newId: () => `id-${++n}`,
    nowIso: () => '2026-07-01T00:00:00.000Z',
  }
}

/** 树 → plan → op[] → apply → 新树。 */
export function act(rows: EntityRow[], plan: (model: GtdModel, ids: OpIds) => Op[]): EntityRow[] {
  const ops = plan(new GtdModel(rows), stamp())
  return applyOps(rows, ops, 'u1')
}

export function task(rows: EntityRow[], id: string): EntityRowOf<'task'> {
  const row = rows.find((item): item is EntityRowOf<'task'> => item.entity === 'task' && item.id === id)
  if (!row)
    throw new Error(`任务 ${id} 不在结果里`)
  return row
}

export function read(rows: EntityRow[]) {
  const tasks = rows.filter((row): row is EntityRowOf<'task'> => row.entity === 'task')
  const tree = buildTaskTree(tasks)
  return {
    tree,
    physical: (id: string) => task(rows, id).data.status,
    status: (id: string) => effectiveStatus(task(rows, id), tree),
    due: (id: string) => effectiveDue(task(rows, id), tree),
    defer: (id: string) => effectiveDefer(task(rows, id), tree),
    plannedMode: (id: string) => effectivePlannedMode(task(rows, id), tree),
    plannedDate: (id: string) => effectivePlannedDate(task(rows, id), tree),
  }
}
