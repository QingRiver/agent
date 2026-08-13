import type { GroupKey, SortKey } from '../data/schema'
import type { FilterNode, PerspectiveInputError, PerspectiveResolutionContext } from './filter'
import { z } from 'zod'
import {
  GroupKeySchema,
  SortDirSchema,
  SortFieldSchema,
} from '../data/schema'
import { FILTER_FIELD, isBuiltinPerspectiveId } from '../data/types'
import {
  allowedOpsForField,
  err,
  FILTER_ERROR_CODE,
  FilterNodeSchema,
  validateFilterNode,
} from './filter'

/**
 * 透视输入校验（UI / MCP 共用）。过滤 DSL 的 schema / 求值 / 校验核心位于
 * {@link ./filter}；本文件只负责顶层 Perspective 形态（name / groupBy / sortBy 等）与 filter 树的编排。
 */

const SortKeyInputSchema = z.object({
  field: SortFieldSchema,
  dir: SortDirSchema,
})

export const PerspectiveInputSchema = z.object({
  name: z.string(),
  icon: z.string().nullable().optional(),
  filter: FilterNodeSchema.nullable(),
  groupBy: z.array(GroupKeySchema),
  sortBy: z.array(SortKeyInputSchema),
})

export type PerspectiveInput = z.infer<typeof PerspectiveInputSchema>

export const PerspectiveQuerySchema = PerspectiveInputSchema.omit({
  name: true,
  icon: true,
}).extend({
  name: z.string().optional(),
})

export type PerspectiveQuery = z.infer<typeof PerspectiveQuerySchema>

interface ResolvedPerspectiveSpec {
  name?: string
  icon?: string | null
  filter: FilterNode | null
  groupBy: GroupKey[]
  sortBy: SortKey[]
}

interface ValidatePerspectiveInputOptions {
  mode: 'persist' | 'query'
  perspectiveId?: string
}

export type ValidationResult
  = | { ok: true, value: ResolvedPerspectiveSpec }
    | { ok: false, errors: PerspectiveInputError[] }

function zodIssuesToErrors(issues: z.ZodIssue[]): PerspectiveInputError[] {
  return issues.map(issue => ({
    path: issue.path.join('.'),
    code: FILTER_ERROR_CODE.INVALID_SHAPE,
    message: issue.message,
    received: issue,
  }))
}

function validateDuplicateFields(
  fields: readonly string[],
  pathPrefix: string,
  code: typeof FILTER_ERROR_CODE.DUPLICATE_SORT_KEY | typeof FILTER_ERROR_CODE.DUPLICATE_GROUP_KEY,
): PerspectiveInputError[] {
  const seen = new Set<string>()
  const errors: PerspectiveInputError[] = []
  for (let i = 0; i < fields.length; i++) {
    const key = fields[i]!
    if (seen.has(key)) {
      errors.push(err(`${pathPrefix}[${i}]`, code, `重复字段 ${key}`, { received: key }))
    }
    seen.add(key)
  }
  return errors
}

/** 校验并解析 Perspective 输入（UI / MCP 共用） */
export function validatePerspectiveInput(
  input: unknown,
  context: PerspectiveResolutionContext,
  options: ValidatePerspectiveInputOptions,
): ValidationResult {
  const allowRelative = options.mode === 'query'
  const schema = options.mode === 'query' ? PerspectiveQuerySchema : PerspectiveInputSchema
  const parsed = schema.safeParse(input)
  if (!parsed.success)
    return { ok: false, errors: zodIssuesToErrors(parsed.error.issues) }

  const data = parsed.data
  const errors: PerspectiveInputError[] = []

  if (options.mode === 'persist') {
    if (!data.name || data.name.trim().length === 0) {
      errors.push(err('name', FILTER_ERROR_CODE.EMPTY_NAME, '透视名称不能为空'))
    }
  }

  if (options.perspectiveId && isBuiltinPerspectiveId(options.perspectiveId)) {
    errors.push(err(
      'id',
      FILTER_ERROR_CODE.BUILTIN_ID_RESERVED,
      `内置透视 ${options.perspectiveId} 不可修改`,
      { received: options.perspectiveId },
    ))
  }

  errors.push(...validateDuplicateFields(data.groupBy, 'groupBy', FILTER_ERROR_CODE.DUPLICATE_GROUP_KEY))
  errors.push(...validateDuplicateFields(
    data.sortBy.map(k => k.field),
    'sortBy',
    FILTER_ERROR_CODE.DUPLICATE_SORT_KEY,
  ))

  if (errors.length > 0)
    return { ok: false, errors }

  // filter 树递归校验 + 解析
  let filter: FilterNode | null = null
  if (data.filter != null) {
    const r = validateFilterNode(data.filter, context, { allowRelative })
    if (!r.ok)
      return { ok: false, errors: r.errors }
    filter = r.value
  }

  const spec: ResolvedPerspectiveSpec = {
    filter,
    groupBy: data.groupBy,
    sortBy: data.sortBy,
  }

  if (options.mode === 'persist') {
    const persist = data as PerspectiveInput
    spec.name = persist.name.trim()
    spec.icon = persist.icon ?? null
  }
  else if (data.name != null) {
    spec.name = data.name
  }

  return { ok: true, value: spec }
}

/** 生成 field × operator 矩阵 Markdown（Prompt 注入） */
export function formatFilterMatrixMarkdown(): string {
  const lines = ['| Field | Operators | Value |', '|-------|-----------|-------|']
  const valueHints: Record<string, string> = {
    [FILTER_FIELD.STATUS]: 'ExplicitStatus',
    [FILTER_FIELD.PROJECT]: 'EntityRef[]（some）/ 无（empty）',
    [FILTER_FIELD.TAG]: 'EntityRef[]（some，交集）/ 无（empty）',
    [FILTER_FIELD.DEFER_DATE]: 'TemporalValue（before/after）/ [TemporalValue, TemporalValue]（within）/ 无（exist）',
    [FILTER_FIELD.DUE_DATE]: 'TemporalValue（before/after）/ [TemporalValue, TemporalValue]（within）/ 无（exist）',
    [FILTER_FIELD.FLAGGED]: 'boolean',
    [FILTER_FIELD.ESTIMATE]: 'number（分钟；is/before/after）/ [number, number]（within）/ 无（exist）',
  }
  for (const field of Object.values(FILTER_FIELD)) {
    const ops = allowedOpsForField(field).join(', ')
    lines.push(`| \`${field}\` | ${ops} | ${valueHints[field] ?? ''} |`)
  }
  return lines.join('\n')
}
