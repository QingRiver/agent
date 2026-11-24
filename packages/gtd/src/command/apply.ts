/**
 * 把 Op 写回 state。HTTP 请求体同样是 Op。
 * 仅做分派：执行器在 state/（runCreate/runMove/runPatch/runDelete/runPurge）与 command/transition（状态机）。
 */
import type { EntityRow } from '../data/row-schema'
import type { ApplyRequest, GtdRowsResponse, Op } from './op'
import { runCreate } from '../state/create'
import { runDelete, runPurge } from '../state/delete'
import { GtdModel } from '../state/model'
import { runMove, runPatch } from '../state/update'
import { ApplyRequestSchema, GtdRowsResponseSchema, OpSchema } from './op'
import { transition } from './transition'

export { ApplyRequestSchema, GtdRowsResponseSchema, OpSchema }
export type { ApplyRequest, GtdRowsResponse, Op }

export function applyOps(
  rows: EntityRow[],
  ops: readonly Op[],
  userId: string,
  nextSyncId?: () => number,
): EntityRow[] {
  const working = structuredClone(rows)
  const model = new GtdModel(working, nextSyncId)
  for (const op of ops)
    runOp(model, op, userId)
  return model.rows.filter(row => !row.deleted)
}

export function runOp(model: GtdModel, op: Op, userId: string): void {
  switch (op.kind) {
    case 'transition':
      transition(model, op.taskId, op.action, op.clientTs)
      return
    case 'create':
      runCreate(model, op, userId)
      return
    case 'move':
      runMove(model, op)
      return
    case 'patch':
      runPatch(model, op, userId)
      return
    case 'delete':
      runDelete(model, op)
      return
    case 'purge':
      runPurge(model, op.taskId)
  }
}
