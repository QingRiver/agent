import type { RowStore } from '../../data/rows'
import type { EntityRowOf } from '../../data/sync-schema'
import type { TaskTree } from '../../structure/tree'
import type { FilterNode, LeafOp } from './schema'
import { match, P } from 'ts-pattern'
import { FILTER_FIELD } from '../../data/types'
import { effectiveDefer, effectiveDue } from '../../inheritance/effective'
import { isEmptyValueArrayOrScalar } from './helpers'
import { isDateField, isNumericField, LEAF_OP, LOGIC_OP } from './schema'

/**
 * DSL 求值引擎。吃 RowStore（行级）。
 */

/** 引擎求值上下文：rowStore + 可选树（Due / Defer 读时继承）。TAG 只看物理 task_tag。 */
export interface FilterEvalContext {
  rowStore: RowStore
  tree?: TaskTree
}

export function matchFilter(
  task: EntityRowOf<'task'>,
  node: FilterNode | null,
  ctx: FilterEvalContext,
): boolean {
  if (node == null) {
    return true
  }
  return evalNode(task, node, ctx)
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

function evalLeaf(task: EntityRowOf<'task'>, node: FilterNode & { op: LeafOp }, ctx: FilterEvalContext): boolean {
  const v = rawValue(task, node.field, ctx.rowStore, ctx.tree)
  const target = node.value
  return match(node.op)
    .with(LEAF_OP.IS, () => evaluateIs(v, target))
    .with(LEAF_OP.IS_NOT, () => evaluateIsNot(v, target))
    .with(LEAF_OP.SOME, () => evaluateSome(node.field, v, target))
    .with(LEAF_OP.EMPTY, () => evaluateEmpty(v))
    .with(LEAF_OP.EXIST, () => evaluateExist(v))
    .with(LEAF_OP.BEFORE, () => compareFieldValue(node.field, v, target, LEAF_OP.BEFORE))
    .with(LEAF_OP.AFTER, () => compareFieldValue(node.field, v, target, LEAF_OP.AFTER))
    .with(LEAF_OP.WITHIN, () => compareFieldValue(node.field, v, target, LEAF_OP.WITHIN))
    .exhaustive()
}

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

/** 比较类叶子：numeric / date 共用，避免 before/after/within 三份拷贝 */
function compareFieldValue(
  field: string,
  v: unknown,
  target: unknown,
  op: typeof LEAF_OP.BEFORE | typeof LEAF_OP.AFTER | typeof LEAF_OP.WITHIN,
): boolean {
  return match({ field, v, target, op })
    .with({ v: P.nullish }, () => false)
    .with({ target: P.nullish, op: P.not(LEAF_OP.WITHIN) }, () => false)
    .with({ op: LEAF_OP.WITHIN }, ({ field: f, v: val, target: t }) => {
      if (!Array.isArray(t) || t.length !== 2 || isEmptyValueArrayOrScalar(val))
        return false
      const [lo, hi] = t
      if (isNumericField(f)) {
        const n = val as number
        return n >= (lo as number) && n <= (hi as number)
      }
      if (isDateField(f)) {
        const ms = new Date(val as string).getTime()
        return ms >= new Date(lo as string).getTime()
          && ms <= new Date(hi as string).getTime()
      }
      return false
    })
    .with({ field: P.when(isNumericField), op: LEAF_OP.BEFORE }, ({ v: val, target: t }) =>
      (val as number) < (t as number))
    .with({ field: P.when(isNumericField), op: LEAF_OP.AFTER }, ({ v: val, target: t }) =>
      (val as number) > (t as number))
    .with({ field: P.when(isDateField), op: LEAF_OP.BEFORE }, ({ v: val, target: t }) =>
      new Date(val as string).getTime() < new Date(t as string).getTime())
    .with({ field: P.when(isDateField), op: LEAF_OP.AFTER }, ({ v: val, target: t }) =>
      new Date(val as string).getTime() > new Date(t as string).getTime())
    .otherwise(() => false)
}

/**
 * 取 task 在某 field 上的求值（过滤/排序共用）。
 * PROJECT：注入 projectOf 优先，回退 task.data.projectId（server 派生缓存）。
 * TAG：物理 `task_tag`（入组时写复制，无读时 coalesce）。
 * DUE_DATE / DEFER_DATE：有 `tree` 时走 effectiveDue / effectiveDefer（与 sort/group/forecast 对齐）。
 */
export function rawValue(
  task: EntityRowOf<'task'>,
  field: string,
  rowStore: RowStore,
  tree?: TaskTree,
): unknown {
  switch (field) {
    case FILTER_FIELD.STATUS: return task.data.status
    case FILTER_FIELD.PROJECT: return rowStore.projectOf?.(task) ?? task.data.projectId
    case FILTER_FIELD.TAG: return rowStore.tagIdsOf(task.id)
    case FILTER_FIELD.DEFER_DATE:
      return tree != null ? effectiveDefer(task, tree) : task.data.deferDate
    case FILTER_FIELD.DUE_DATE:
      return tree != null ? effectiveDue(task, tree) : task.data.dueDate
    case FILTER_FIELD.FLAGGED: return task.data.flagged
    case FILTER_FIELD.ESTIMATE: return task.data.estimateMinutes
    default: return null
  }
}
