/**
 * 可嵌套 JSON DSL：view 侧 field×op 矩阵、输入原语与校验辅助。
 * 持久化类型（FilterNode / LOGIC_OP / LEAF_OP）真相在 data/filter-schema。
 */
import { z } from 'zod'
import { LEAF_OP } from '../../data/filter-schema'
import { FILTER_FIELD } from '../../data/types'

export {
  FilterNodeSchema,
  LEAF_OP,
  LEAF_OP_TEXT,
  LOGIC_OP,
  LOGIC_OP_TEXT,
} from '../../data/filter-schema'
export type { FilterNode, LeafOp } from '../../data/filter-schema'
export { FILTER_FIELD } from '../../data/types'

// ===== field × op 矩阵（Zod 校验 / UI / Prompt 共用，单一事实源） =====

export const FILTER_FIELD_OPS = {
  [FILTER_FIELD.STATUS]: [LEAF_OP.IS, LEAF_OP.IS_NOT],
  [FILTER_FIELD.FLAGGED]: [LEAF_OP.IS, LEAF_OP.IS_NOT],
  [FILTER_FIELD.PROJECT]: [LEAF_OP.SOME, LEAF_OP.EMPTY],
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

const DATE_FILTER_FIELDS = [FILTER_FIELD.DEFER_DATE, FILTER_FIELD.DUE_DATE] as const

const NUMERIC_FILTER_FIELDS = [FILTER_FIELD.ESTIMATE] as const

const ENTITY_FILTER_FIELDS = [
  FILTER_FIELD.PROJECT,
  FILTER_FIELD.TAG,
] as const

/** 无 value 的操作符（empty / exist） */
const NULLARY_OPS = [LEAF_OP.EMPTY, LEAF_OP.EXIST] as const

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

type FilterErrorCode = (typeof FILTER_ERROR_CODE)[keyof typeof FILTER_ERROR_CODE]

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

type RelativeDateToken = (typeof RELATIVE_DATE_LITERALS)[number] | string

export function isRelativeDateToken(token: string): token is RelativeDateToken {
  if ((RELATIVE_DATE_LITERALS as readonly string[]).includes(token))
    return true
  return RELATIVE_DATE_TOKEN_REGEX.test(token)
}

/** DSL 结构约束（SPEC：深度 ≤ 5、节点数 ≤ 32） */
export const FILTER_LIMITS = {
  MAX_DEPTH: 5,
  MAX_NODES: 32,
} as const
