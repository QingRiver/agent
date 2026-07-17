import type { GtdDocument, Task } from '../schema'
import type { FilterNode, LeafOp } from './schema'
import { FILTER_FIELD } from '../types'
import { isEmptyValueArrayOrScalar } from './helpers'
import { isDateField, isNumericField, LEAF_OP, LOGIC_OP } from './schema'

/**
 * DSL 求值引擎（SPEC §5.5 核心）。
 *
 * 接收已解析的 {@link FilterNode}（相对日期/实体引用已在 validate 阶段解析为
 * 绝对 ISO / id），对单个 Task 求值是否命中。纯函数，无副作用。
 *
 * 设计：
 * - `rawValue` 按 field 取 Task 原始值（与排序共用）。
 * - 叶子求值复用旧 `evaluateXxx` 语义，仅按新 op 名分派。
 * - 逻辑节点递归求值，and/or 短路。
 */

/** 引擎求值上下文：仅需 doc（folder 字段需反查 project.folderId） */
export interface FilterEvalContext {
  doc: GtdDocument
}

/** 取 task 在某 field 上的原始值（过滤/排序共用） */
export function rawValue(task: Task, field: string, doc: GtdDocument): unknown {
  switch (field) {
    case FILTER_FIELD.STATUS: return task.status
    case FILTER_FIELD.PROJECT: return task.projectId
    case FILTER_FIELD.FOLDER: {
      const proj = doc.projects.find(p => p.id === task.projectId)
      return proj?.folderId ?? null
    }
    case FILTER_FIELD.TAG: return task.tagIds
    case FILTER_FIELD.DEFER_DATE: return task.deferDate
    case FILTER_FIELD.DUE_DATE: return task.dueDate
    case FILTER_FIELD.FLAGGED: return task.flagged
    case FILTER_FIELD.ESTIMATE: return task.estimateMinutes
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

/** 包含：与目标 id 集合有交集 */
function evaluateSome(field: string, v: unknown, target: unknown): boolean {
  if (!Array.isArray(target))
    return false
  const ids = target as unknown[]
  if (field === FILTER_FIELD.TAG) {
    // tag 多值：交集非空
    return Array.isArray(v) && ids.some(t => (v as unknown[]).includes(t))
  }
  // project / folder 单值：属于集合
  return ids.includes(v)
}

function evaluateEmpty(v: unknown): boolean {
  return isEmptyValueArrayOrScalar(v)
}

function evaluateExist(v: unknown): boolean {
  return !isEmptyValueArrayOrScalar(v)
}

function evaluateBefore(field: string, v: unknown, target: unknown): boolean {
  if (v == null || target == null)
    return false
  if (isNumericField(field))
    return (v as number) < (target as number)
  if (isDateField(field))
    return new Date(v as string).getTime() < new Date(target as string).getTime()
  return false
}

function evaluateAfter(field: string, v: unknown, target: unknown): boolean {
  if (v == null || target == null)
    return false
  if (isNumericField(field))
    return (v as number) > (target as number)
  if (isDateField(field))
    return new Date(v as string).getTime() > new Date(target as string).getTime()
  return false
}

function evaluateWithin(field: string, v: unknown, target: unknown): boolean {
  if (!Array.isArray(target) || target.length !== 2 || isEmptyValueArrayOrScalar(v))
    return false
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

/** 叶子 op → 求值器分派表 */
function evalLeaf(task: Task, node: FilterNode & { op: LeafOp }, ctx: FilterEvalContext): boolean {
  const v = rawValue(task, node.field, ctx.doc)
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

/**
 * 递归求值节点对 task 是否命中。
 * - and：所有子节点命中（遇 false 短路）
 * - or：任一子节点命中（遇 true 短路）
 * - not：子节点取反
 * - 叶子：按 op 分派
 */
export function evalNode(task: Task, node: FilterNode, ctx: FilterEvalContext): boolean {
  switch (node.op) {
    case LOGIC_OP.AND: {
      for (const child of node.children) {
        if (!evalNode(task, child, ctx))
          return false
      }
      return true
    }
    case LOGIC_OP.OR: {
      for (const child of node.children) {
        if (evalNode(task, child, ctx))
          return true
      }
      return false
    }
    case LOGIC_OP.NOT:
      return !evalNode(task, node.child, ctx)
    default:
      return evalLeaf(task, node, ctx)
  }
}

/** 顶层便捷求值：null/undefined 视为「无过滤」全命中 */
export function matchFilter(
  task: Task,
  node: FilterNode | null | undefined,
  ctx: FilterEvalContext,
): boolean {
  if (node == null)
    return true
  return evalNode(task, node, ctx)
}
