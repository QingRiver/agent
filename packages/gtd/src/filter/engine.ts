import type { RowStore } from '../rows'
import type { EntityRowOf } from '../sync-schema'
import type { FilterNode, LeafOp } from './schema'
import { FILTER_FIELD } from '../types'
import { isEmptyValueArrayOrScalar } from './helpers'
import { isDateField, isNumericField, LEAF_OP, LOGIC_OP } from './schema'

/**
 * DSL 求值引擎。吃 RowStore（行级），不再吃 GtdDocument。
 */

/** 引擎求值上下文：仅需 rowStore（folder 字段需反查 project.folderId） */
export interface FilterEvalContext {
  rowStore: RowStore
}

/** 取 task 在某 field 上的原始值（过滤/排序共用） */
export function rawValue(task: EntityRowOf<'task'>, field: string, rowStore: RowStore): unknown {
  switch (field) {
    case FILTER_FIELD.STATUS: return task.data.status
    case FILTER_FIELD.PROJECT: return task.data.projectId
    case FILTER_FIELD.FOLDER: {
      const proj = rowStore.findLive('project', task.data.projectId ?? '')
      return proj?.data.folderId ?? null
    }
    case FILTER_FIELD.TAG: return rowStore.tagIdsOf(task.id)
    case FILTER_FIELD.DEFER_DATE: return task.data.deferDate
    case FILTER_FIELD.DUE_DATE: return task.data.dueDate
    case FILTER_FIELD.FLAGGED: return task.data.flagged
    case FILTER_FIELD.ESTIMATE: return task.data.estimateMinutes
    default: return null
  }
}

// ---------- 叶子求值器 ----------

function evaluateIs(v: unknown, target: unknown): boolean {
  return v === target
}

function evaluateIsNot(v: unknown, target: unknown): boolean {
  return v !== target
}

function evaluateSome(field: string, v: unknown, target: unknown): boolean {
  if (!Array.isArray(target)) {
    return false
  }
  const ids = target as unknown[]
  if (field === FILTER_FIELD.TAG) {
    return Array.isArray(v) && ids.some(t => (v as unknown[]).includes(t))
  }
  return ids.includes(v)
}

function evaluateEmpty(v: unknown): boolean {
  return isEmptyValueArrayOrScalar(v)
}

function evaluateExist(v: unknown): boolean {
  return !isEmptyValueArrayOrScalar(v)
}

function evaluateBefore(field: string, v: unknown, target: unknown): boolean {
  if (v == null || target == null) {
    return false
  }
  if (isNumericField(field)) {
    return (v as number) < (target as number)
  }
  if (isDateField(field)) {
    return new Date(v as string).getTime() < new Date(target as string).getTime()
  }
  return false
}

function evaluateAfter(field: string, v: unknown, target: unknown): boolean {
  if (v == null || target == null) {
    return false
  }
  if (isNumericField(field)) {
    return (v as number) > (target as number)
  }
  if (isDateField(field)) {
    return new Date(v as string).getTime() > new Date(target as string).getTime()
  }
  return false
}

function evaluateWithin(field: string, v: unknown, target: unknown): boolean {
  if (!Array.isArray(target) || target.length !== 2 || isEmptyValueArrayOrScalar(v)) {
    return false
  }
  const lo = target[0]
  const hi = target[1]
  if (isNumericField(field)) {
    const n = v as number
    return n >= (lo as number) && n <= (hi as number)
  }
  if (isDateField(field)) {
    const ms = new Date(v as string).getTime()
    return ms >= new Date(lo as string).getTime()
      && ms <= new Date(hi as string).getTime()
  }
  return false
}

function evalLeaf(task: EntityRowOf<'task'>, node: FilterNode & { op: LeafOp }, ctx: FilterEvalContext): boolean {
  const v = rawValue(task, node.field, ctx.rowStore)
  const target = node.value
  switch (node.op) {
    case LEAF_OP.IS: return evaluateIs(v, target)
    case LEAF_OP.IS_NOT: return evaluateIsNot(v, target)
    case LEAF_OP.SOME: return evaluateSome(node.field, v, target)
    case LEAF_OP.EMPTY: return evaluateEmpty(v)
    case LEAF_OP.EXIST: return evaluateExist(v)
    case LEAF_OP.BEFORE: return evaluateBefore(node.field, v, target)
    case LEAF_OP.AFTER: return evaluateAfter(node.field, v, target)
    case LEAF_OP.WITHIN: return evaluateWithin(node.field, v, target)
    default: {
      const _exhaustive: never = node.op
      void _exhaustive
      return false
    }
  }
}

export function evalNode(task: EntityRowOf<'task'>, node: FilterNode, ctx: FilterEvalContext): boolean {
  switch (node.op) {
    case LOGIC_OP.AND: {
      for (const child of node.children) {
        if (!evalNode(task, child, ctx)) {
          return false
        }
      }
      return true
    }
    case LOGIC_OP.OR: {
      for (const child of node.children) {
        if (evalNode(task, child, ctx)) {
          return true
        }
      }
      return false
    }
    case LOGIC_OP.NOT:
      return !evalNode(task, node.child, ctx)
    default:
      return evalLeaf(task, node, ctx)
  }
}

export function matchFilter(
  task: EntityRowOf<'task'>,
  node: FilterNode | null | undefined,
  ctx: FilterEvalContext,
): boolean {
  if (node == null) {
    return true
  }
  return evalNode(task, node, ctx)
}
