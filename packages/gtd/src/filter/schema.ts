import { z } from 'zod'
import { FILTER_FIELD } from '../types'

/** re-export：filter 模块作为统一导入面 */
export { FILTER_FIELD }

/**
 * 本地 FilterFieldSchema（与 ../schema 等价，z.enum(FILTER_FIELD)）。
 * 不从 ../schema 导入，以避免 schema.ts ↔ filter/schema.ts 循环依赖。
 */
const FilterFieldSchema = z.enum(FILTER_FIELD)

/**
 * 可嵌套 JSON DSL 的 schema 与类型定义。
 *
 * 设计要点：
 * - 节点用 `op` 判别：逻辑节点（and/or/not）与叶子节点（LeafOp）取值不相交。
 * - 叶子 value 为 `unknown`，op 专属 value 形态由 {@link ./validate.ts} 强校验
 *   （与旧 FilterRule 的 `value: unknown` 同策略）。
 * - 输入树与运行时树共用同一 schema：解析阶段把 EntityRef/TemporalValue 解析为
 *   id/ISO 字符串后，仍符合本 schema（value 为 unknown）。
 * - EntityRef / TemporalValue 原属 perspective-input，迁入此处以避免与
 *   {@link ../perspective-input.ts} 互导产生的循环依赖。
 */

// ===== 逻辑操作符 =====

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

// ===== 叶子操作符 =====

export const LEAF_OP = {
  /** 等于（status / flagged / estimate 标量） */
  IS: 'is',
  /** 不等于 */
  IS_NOT: 'is_not',
  /** 包含：与目标集合有交集（project / folder / tag） */
  SOME: 'some',
  /** 为空：未打任何标签 / 无项目（project / folder / tag） */
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
  [LEAF_OP.IS]: '是',
  [LEAF_OP.IS_NOT]: '不是',
  [LEAF_OP.SOME]: '包含',
  [LEAF_OP.EMPTY]: '为空',
  [LEAF_OP.BEFORE]: '早于',
  [LEAF_OP.AFTER]: '晚于',
  [LEAF_OP.WITHIN]: '区间',
  [LEAF_OP.EXIST]: '已设置',
} as const

// ===== field × op 矩阵（Zod 校验 / UI / Prompt 共用，单一事实源） =====

export const FILTER_FIELD_OPS = {
  [FILTER_FIELD.STATUS]: [LEAF_OP.IS, LEAF_OP.IS_NOT],
  [FILTER_FIELD.FLAGGED]: [LEAF_OP.IS, LEAF_OP.IS_NOT],
  [FILTER_FIELD.PROJECT]: [LEAF_OP.SOME, LEAF_OP.EMPTY],
  [FILTER_FIELD.FOLDER]: [LEAF_OP.SOME, LEAF_OP.EMPTY],
  [FILTER_FIELD.TAG]: [LEAF_OP.SOME, LEAF_OP.EMPTY],
  [FILTER_FIELD.DEFER_DATE]: [LEAF_OP.BEFORE, LEAF_OP.AFTER, LEAF_OP.WITHIN, LEAF_OP.EXIST],
  [FILTER_FIELD.DUE_DATE]: [LEAF_OP.BEFORE, LEAF_OP.AFTER, LEAF_OP.WITHIN, LEAF_OP.EXIST],
  [FILTER_FIELD.ESTIMATE]: [
    LEAF_OP.IS,
    LEAF_OP.IS_NOT,
    LEAF_OP.BEFORE,
    LEAF_OP.AFTER,
    LEAF_OP.WITHIN,
    LEAF_OP.EXIST,
  ],
} as const satisfies Record<string, readonly string[]>

export const DATE_FILTER_FIELDS = [FILTER_FIELD.DEFER_DATE, FILTER_FIELD.DUE_DATE] as const

export const NUMERIC_FILTER_FIELDS = [FILTER_FIELD.ESTIMATE] as const

export const ENTITY_FILTER_FIELDS = [
  FILTER_FIELD.PROJECT,
  FILTER_FIELD.FOLDER,
  FILTER_FIELD.TAG,
] as const

/** 无 value 的操作符（empty / exist） */
export const NULLARY_OPS = [LEAF_OP.EMPTY, LEAF_OP.EXIST] as const

export function allowedOpsForField(field: string): readonly string[] {
  return FILTER_FIELD_OPS[field as keyof typeof FILTER_FIELD_OPS] ?? []
}

export function isNullaryOp(op: string): boolean {
  return (NULLARY_OPS as readonly string[]).includes(op)
}

export function isDateField(field: string): boolean {
  return (DATE_FILTER_FIELDS as readonly string[]).includes(field)
}

export function isNumericField(field: string): boolean {
  return (NUMERIC_FILTER_FIELDS as readonly string[]).includes(field)
}

export function isEntityField(field: string): boolean {
  return (ENTITY_FILTER_FIELDS as readonly string[]).includes(field)
}

export function isStatusField(field: string): boolean {
  return field === FILTER_FIELD.STATUS
}

export function isFlaggedField(field: string): boolean {
  return field === FILTER_FIELD.FLAGGED
}

// ===== 错误码 =====

export const FILTER_ERROR_CODE = {
  INVALID_SHAPE: 'INVALID_SHAPE',
  EMPTY_NAME: 'EMPTY_NAME',
  INVALID_FIELD_OP: 'INVALID_FIELD_OP',
  INVALID_VALUE_SHAPE: 'INVALID_VALUE_SHAPE',
  INVALID_DATE_TOKEN: 'INVALID_DATE_TOKEN',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  REF_NOT_FOUND: 'REF_NOT_FOUND',
  AMBIGUOUS_REF: 'AMBIGUOUS_REF',
  REF_CONFLICT: 'REF_CONFLICT',
  BUILTIN_ID_RESERVED: 'BUILTIN_ID_RESERVED',
  DUPLICATE_SORT_KEY: 'DUPLICATE_SORT_KEY',
  DUPLICATE_GROUP_KEY: 'DUPLICATE_GROUP_KEY',
  /** 节点深度超限 */
  DEPTH_LIMIT: 'DEPTH_LIMIT',
  /** 节点总数超限 */
  NODE_LIMIT: 'NODE_LIMIT',
} as const

export type FilterErrorCode = (typeof FILTER_ERROR_CODE)[keyof typeof FILTER_ERROR_CODE]

/** 兼容旧名（perspective-input / 消费方历史引用） */
export const PERSPECTIVE_INPUT_ERROR_CODE = FILTER_ERROR_CODE

export type PerspectiveInputErrorCode = FilterErrorCode

export interface PerspectiveInputError {
  path: string
  code: FilterErrorCode
  message: string
  expected?: unknown
  received?: unknown
}

// ===== 值原语：EntityRef / TemporalValue =====

export const EntityRefSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
  })
  .refine(v => v.id != null || v.name != null, {
    message: 'EntityRef 需要 id 或 name 至少一个',
  })

export type EntityRef = z.infer<typeof EntityRefSchema>

export const TemporalValueSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('absolute'),
    value: z.string().datetime(),
  }),
  z.object({
    type: z.literal('relative'),
    value: z.string().min(1),
  }),
])

export type TemporalValue = z.infer<typeof TemporalValueSchema>

// ===== 相对日期 token 白名单 =====

export const RELATIVE_DATE_LITERALS = ['today', 'tomorrow', 'start_of_week', 'end_of_week'] as const

const RELATIVE_DATE_TOKEN_REGEX = /^[+-]\d+[dw]$/

export type RelativeDateToken = (typeof RELATIVE_DATE_LITERALS)[number] | string

export function isRelativeDateToken(token: string): token is RelativeDateToken {
  if ((RELATIVE_DATE_LITERALS as readonly string[]).includes(token))
    return true
  return RELATIVE_DATE_TOKEN_REGEX.test(token)
}

// ===== FilterNode =====

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

/** 输入树与运行时树共用 schema（value 为 unknown，op 专属形态由 validate 校验）。 */
export type FilterNodeInput = FilterNode

/** DSL 结构约束（SPEC：深度 ≤ 5、节点数 ≤ 32） */
export const FILTER_LIMITS = {
  MAX_DEPTH: 5,
  MAX_NODES: 32,
} as const
