/**
 * 可持久化过滤 DSL 的类型与 zod schema（data 层真相源）。
 * view/filter 在此之上叠加 field×op 矩阵、校验与求值。
 */
import { z } from 'zod'
import { FILTER_FIELD } from './types'

const FilterFieldSchema = z.enum(FILTER_FIELD)

export const LOGIC_OP = {
  /** 与（全部子节点命中） */
  AND: 'and',
  /** 或（任一子节点命中） */
  OR: 'or',
  /** 非（单子节点取反） */
  NOT: 'not',
} as const

export const LOGIC_OP_TEXT = {
  [LOGIC_OP.AND]: '且',
  [LOGIC_OP.OR]: '或',
  [LOGIC_OP.NOT]: '非',
} as const

export const LEAF_OP = {
  /** 等于（status / flagged / estimate 标量） */
  IS: 'is',
  /** 不等于 */
  IS_NOT: 'is_not',
  /** 包含：与目标集合有交集（project / tag） */
  SOME: 'some',
  /** 为空：未打任何标签 / 无项目（project / tag） */
  EMPTY: 'empty',
  /** 早于（日期 / 数值） */
  BEFORE: 'before',
  /** 晚于（日期 / 数值） */
  AFTER: 'after',
  /** 区间内（日期 / 数值） */
  WITHIN: 'within',
  /** 已设置（非空） */
  EXIST: 'exist',
} as const

export const LEAF_OP_TEXT = {
  [LEAF_OP.IS]: '等于',
  [LEAF_OP.IS_NOT]: '不等于',
  [LEAF_OP.SOME]: '属于',
  [LEAF_OP.EMPTY]: '为空',
  [LEAF_OP.BEFORE]: '早于',
  [LEAF_OP.AFTER]: '晚于',
  [LEAF_OP.WITHIN]: '在区间',
  [LEAF_OP.EXIST]: '已设置',
} as const

export type LeafOp = (typeof LEAF_OP)[keyof typeof LEAF_OP]

export type FilterNode
  = | { op: typeof LOGIC_OP.AND | typeof LOGIC_OP.OR, children: FilterNode[] }
    | { op: typeof LOGIC_OP.NOT, child: FilterNode }
    | { op: LeafOp, field: z.infer<typeof FilterFieldSchema>, value?: unknown }

/** 递归 schema：用 z.lazy + z.union 表达任意嵌套。 */
export const FilterNodeSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([
    z.object({
      op: z.literal(LOGIC_OP.AND),
      children: z.array(FilterNodeSchema),
    }),
    z.object({
      op: z.literal(LOGIC_OP.OR),
      children: z.array(FilterNodeSchema),
    }),
    z.object({
      op: z.literal(LOGIC_OP.NOT),
      child: FilterNodeSchema,
    }),
    z.object({
      op: z.enum(LEAF_OP),
      field: FilterFieldSchema,
      value: z.unknown().optional(),
    }),
  ]),
)
