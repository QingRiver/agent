import type { FilterRule, GroupKey, SortKey } from './schema'
import { z } from 'zod'
import {
  AvailabilityFilterSchema,
  ExplicitStatusSchema,
  FilterFieldSchema,
  FilterOpSchema,
  GroupKeySchema,
  PerspectiveMatchSchema,
  SortDirSchema,
  SortFieldSchema,
} from './schema'
import {
  AVAILABILITY_FILTER,
  FILTER_FIELD,
  FILTER_OP,
  PERSPECTIVE_MATCH,
} from './types'

/** field × operator 矩阵（Zod 校验、UI、Prompt 共用） */
export const FILTER_FIELD_OPS = {
  [FILTER_FIELD.STATUS]: [FILTER_OP.EQ, FILTER_OP.NE, FILTER_OP.IN],
  [FILTER_FIELD.PROJECT]: [
    FILTER_OP.EQ,
    FILTER_OP.NE,
    FILTER_OP.IN,
    FILTER_OP.IS_NULL,
    FILTER_OP.IS_NOT_NULL,
  ],
  [FILTER_FIELD.FOLDER]: [
    FILTER_OP.EQ,
    FILTER_OP.NE,
    FILTER_OP.IN,
    FILTER_OP.IS_NULL,
    FILTER_OP.IS_NOT_NULL,
  ],
  [FILTER_FIELD.TAG]: [
    FILTER_OP.EQ,
    FILTER_OP.NE,
    FILTER_OP.IN,
    FILTER_OP.IS_NULL,
    FILTER_OP.IS_NOT_NULL,
  ],
  [FILTER_FIELD.DEFER_DATE]: [
    FILTER_OP.EQ,
    FILTER_OP.BEFORE,
    FILTER_OP.AFTER,
    FILTER_OP.BETWEEN,
    FILTER_OP.IS_NULL,
    FILTER_OP.IS_NOT_NULL,
  ],
  [FILTER_FIELD.DUE_DATE]: [
    FILTER_OP.EQ,
    FILTER_OP.BEFORE,
    FILTER_OP.AFTER,
    FILTER_OP.BETWEEN,
    FILTER_OP.IS_NULL,
    FILTER_OP.IS_NOT_NULL,
  ],
  [FILTER_FIELD.FLAGGED]: [FILTER_OP.EQ, FILTER_OP.NE],
  [FILTER_FIELD.ESTIMATE]: [
    FILTER_OP.EQ,
    FILTER_OP.NE,
    FILTER_OP.BEFORE,
    FILTER_OP.AFTER,
    FILTER_OP.BETWEEN,
    FILTER_OP.IS_NULL,
    FILTER_OP.IS_NOT_NULL,
  ],
} as const satisfies Record<string, readonly string[]>

export const DATE_FILTER_FIELDS = [
  FILTER_FIELD.DEFER_DATE,
  FILTER_FIELD.DUE_DATE,
] as const

export const NUMERIC_FILTER_FIELDS = [FILTER_FIELD.ESTIMATE] as const

export const ARRAY_FILTER_FIELDS = [FILTER_FIELD.TAG] as const

export const ENTITY_FILTER_FIELDS = [
  FILTER_FIELD.PROJECT,
  FILTER_FIELD.FOLDER,
  FILTER_FIELD.TAG,
] as const

export const NULLARY_OPS = [FILTER_OP.IS_NULL, FILTER_OP.IS_NOT_NULL] as const

/** 相对日期 token 白名单（固定词 + ±Nd / ±Nw） */
export const RELATIVE_DATE_LITERALS = [
  'today',
  'tomorrow',
  'start_of_week',
  'end_of_week',
] as const

const RELATIVE_DATE_TOKEN_REGEX = /^[+-]\d+[dw]$/

export type RelativeDateToken
  = | (typeof RELATIVE_DATE_LITERALS)[number]
    | string

export const PERSPECTIVE_INPUT_ERROR_CODE = {
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
} as const

export type PerspectiveInputErrorCode
  = (typeof PERSPECTIVE_INPUT_ERROR_CODE)[keyof typeof PERSPECTIVE_INPUT_ERROR_CODE]

export interface PerspectiveInputError {
  path: string
  code: PerspectiveInputErrorCode
  message: string
  expected?: unknown
  received?: unknown
}

export type ValidationResult
  = | { ok: true, value: ResolvedPerspectiveSpec }
    | { ok: false, errors: PerspectiveInputError[] }

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

export const FilterRuleInputSchema = z.object({
  field: FilterFieldSchema,
  op: FilterOpSchema,
  value: z.unknown().optional(),
})

export type FilterRuleInput = z.infer<typeof FilterRuleInputSchema>

export const SortKeyInputSchema = z.object({
  field: SortFieldSchema,
  dir: SortDirSchema,
})

export const PerspectiveInputSchema = z.object({
  name: z.string(),
  icon: z.string().nullable().optional(),
  matchMode: PerspectiveMatchSchema,
  filterRules: z.array(FilterRuleInputSchema),
  groupBy: z.array(GroupKeySchema),
  sortBy: z.array(SortKeyInputSchema),
  availabilityFilter: AvailabilityFilterSchema,
  showCompleted: z.boolean(),
  showDropped: z.boolean(),
  flaggedOnly: z.boolean().nullable(),
})

export type PerspectiveInput = z.infer<typeof PerspectiveInputSchema>

export const PerspectiveQuerySchema = PerspectiveInputSchema.omit({
  name: true,
  icon: true,
}).extend({
  name: z.string().optional(),
})

export type PerspectiveQuery = z.infer<typeof PerspectiveQuerySchema>

export interface ResolvedFilterRule {
  field: FilterRule['field']
  op: FilterRule['op']
  value: FilterRule['value']
}

export interface ResolvedPerspectiveSpec {
  name?: string
  icon?: string | null
  matchMode: PerspectiveInput['matchMode']
  filterRules: ResolvedFilterRule[]
  groupBy: GroupKey[]
  sortBy: SortKey[]
  availabilityFilter: PerspectiveInput['availabilityFilter']
  showCompleted: boolean
  showDropped: boolean
  flaggedOnly: boolean | null
}

export interface PerspectiveEntityRef {
  id: string
  name: string
}

export interface PerspectiveFolderRef extends PerspectiveEntityRef {
  parentId: string | null
}

export interface PerspectiveTagRef extends PerspectiveEntityRef {
  parentId: string | null
}

export interface PerspectiveResolutionContext {
  now: Date
  timeZone: string
  projects: PerspectiveEntityRef[]
  folders: PerspectiveFolderRef[]
  tags: PerspectiveTagRef[]
  builtinPerspectiveIds?: string[]
}

export interface ValidatePerspectiveInputOptions {
  mode: 'persist' | 'query'
  perspectiveId?: string
}

export function isRelativeDateToken(token: string): token is RelativeDateToken {
  if ((RELATIVE_DATE_LITERALS as readonly string[]).includes(token))
    return true
  return RELATIVE_DATE_TOKEN_REGEX.test(token)
}

export function allowedOpsForField(field: string): readonly string[] {
  return FILTER_FIELD_OPS[field as keyof typeof FILTER_FIELD_OPS] ?? []
}

function err(
  path: string,
  code: PerspectiveInputErrorCode,
  message: string,
  extra?: Pick<PerspectiveInputError, 'expected' | 'received'>,
): PerspectiveInputError {
  return { path, code, message, ...extra }
}

function isNullaryOp(op: string): boolean {
  return (NULLARY_OPS as readonly string[]).includes(op)
}

function isDateField(field: string): boolean {
  return (DATE_FILTER_FIELDS as readonly string[]).includes(field)
}

function isNumericField(field: string): boolean {
  return (NUMERIC_FILTER_FIELDS as readonly string[]).includes(field)
}

function isEntityField(field: string): boolean {
  return (ENTITY_FILTER_FIELDS as readonly string[]).includes(field)
}

function isStatusField(field: string): boolean {
  return field === FILTER_FIELD.STATUS
}

function isFlaggedField(field: string): boolean {
  return field === FILTER_FIELD.FLAGGED
}

function parseEntityRef(value: unknown): EntityRef | null {
  const parsed = EntityRefSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function parseEntityRefArray(value: unknown): EntityRef[] | null {
  if (!Array.isArray(value))
    return null
  const refs: EntityRef[] = []
  for (const item of value) {
    const ref = parseEntityRef(item)
    if (!ref)
      return null
    refs.push(ref)
  }
  return refs
}

function parseTemporalValue(value: unknown): TemporalValue | null {
  const parsed = TemporalValueSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function parseTemporalPair(value: unknown): [TemporalValue, TemporalValue] | null {
  if (!Array.isArray(value) || value.length !== 2)
    return null
  const a = parseTemporalValue(value[0])
  const b = parseTemporalValue(value[1])
  if (!a || !b)
    return null
  return [a, b]
}

function getZonedDateParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  const parts = Object.fromEntries(
    dtf.formatToParts(date)
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value]),
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday ?? 'Mon',
  }
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    dtf.formatToParts(date)
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value]),
  )
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return asUtc - date.getTime()
}

/** 用户时区某日历日的 00:00:00.000 对应 UTC 时刻 */
export function startOfZonedDay(date: Date, timeZone: string): Date {
  const { year, month, day } = getZonedDateParts(date, timeZone)
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const offset = getTimeZoneOffsetMs(noonUtc, timeZone)
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offset)
}

function addZonedDays(base: Date, timeZone: string, days: number): Date {
  const { year, month, day } = getZonedDateParts(base, timeZone)
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0))
  return startOfZonedDay(shifted, timeZone)
}

function weekdayIndex(weekday: string): number {
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return map[weekday] ?? 0
}

function startOfZonedWeek(date: Date, timeZone: string): Date {
  const parts = getZonedDateParts(date, timeZone)
  const dayIdx = weekdayIndex(parts.weekday)
  const mondayOffset = dayIdx === 0 ? -6 : 1 - dayIdx
  return addZonedDays(startOfZonedDay(date, timeZone), timeZone, mondayOffset)
}

function endOfZonedWeek(date: Date, timeZone: string): Date {
  const start = startOfZonedWeek(date, timeZone)
  const endDay = addZonedDays(start, timeZone, 6)
  return new Date(endDay.getTime() + 24 * 60 * 60 * 1000 - 1)
}

/** 将相对 token 解析为绝对 ISO（基于显式 now + timeZone） */
export function resolveRelativeDateToken(
  token: string,
  now: Date,
  timeZone: string,
): string | null {
  if (!isRelativeDateToken(token))
    return null

  const today = startOfZonedDay(now, timeZone)

  if (token === 'today')
    return today.toISOString()
  if (token === 'tomorrow')
    return addZonedDays(today, timeZone, 1).toISOString()
  if (token === 'start_of_week')
    return startOfZonedWeek(now, timeZone).toISOString()
  if (token === 'end_of_week')
    return endOfZonedWeek(now, timeZone).toISOString()

  const match = token.match(/^([+-])(\d+)([dw])$/)
  if (!match)
    return null

  const sign = match[1] === '-' ? -1 : 1
  const amount = Number(match[2]) * sign
  const unit = match[3]
  const deltaDays = unit === 'w' ? amount * 7 : amount
  return addZonedDays(today, timeZone, deltaDays).toISOString()
}

export function resolveTemporalValue(
  temporal: TemporalValue,
  now: Date,
  timeZone: string,
  allowRelative: boolean,
): { ok: true, value: string } | { ok: false, code: PerspectiveInputErrorCode } {
  if (temporal.type === 'absolute')
    return { ok: true, value: temporal.value }

  if (!allowRelative)
    return { ok: false, code: PERSPECTIVE_INPUT_ERROR_CODE.INVALID_DATE_TOKEN }

  const resolved = resolveRelativeDateToken(temporal.value, now, timeZone)
  if (!resolved)
    return { ok: false, code: PERSPECTIVE_INPUT_ERROR_CODE.INVALID_DATE_TOKEN }

  return { ok: true, value: resolved }
}

type EntityKind = 'project' | 'folder' | 'tag'

function entitiesForKind(
  context: PerspectiveResolutionContext,
  kind: EntityKind,
): PerspectiveEntityRef[] {
  switch (kind) {
    case 'project':
      return context.projects
    case 'folder':
      return context.folders
    case 'tag':
      return context.tags
  }
}

function entityKindForField(field: string): EntityKind | null {
  if (field === FILTER_FIELD.PROJECT)
    return 'project'
  if (field === FILTER_FIELD.FOLDER)
    return 'folder'
  if (field === FILTER_FIELD.TAG)
    return 'tag'
  return null
}

export function resolveEntityRef(
  ref: EntityRef,
  kind: EntityKind,
  context: PerspectiveResolutionContext,
): { ok: true, id: string } | { ok: false, error: PerspectiveInputError } {
  const entities = entitiesForKind(context, kind)
  const byId = ref.id ? entities.find(e => e.id === ref.id) : undefined
  const byName = ref.name
    ? entities.filter(e => e.name === ref.name)
    : []

  if (ref.id && ref.name) {
    if (!byId) {
      return {
        ok: false,
        error: err('', PERSPECTIVE_INPUT_ERROR_CODE.REF_NOT_FOUND, `未找到 id=${ref.id}`),
      }
    }
    if (byId.name !== ref.name) {
      return {
        ok: false,
        error: err(
          '',
          PERSPECTIVE_INPUT_ERROR_CODE.REF_CONFLICT,
          `id=${ref.id} 与 name=${ref.name} 指向不同实体`,
          { expected: byId.name, received: ref.name },
        ),
      }
    }
    return { ok: true, id: byId.id }
  }

  if (ref.id) {
    if (!byId) {
      return {
        ok: false,
        error: err('', PERSPECTIVE_INPUT_ERROR_CODE.REF_NOT_FOUND, `未找到 id=${ref.id}`),
      }
    }
    return { ok: true, id: byId.id }
  }

  if (byName.length === 0) {
    return {
      ok: false,
      error: err('', PERSPECTIVE_INPUT_ERROR_CODE.REF_NOT_FOUND, `未找到 name=${ref.name}`),
    }
  }
  if (byName.length > 1) {
    return {
      ok: false,
      error: err(
        '',
        PERSPECTIVE_INPUT_ERROR_CODE.AMBIGUOUS_REF,
        `name=${ref.name} 匹配 ${byName.length} 个实体，请改用 id`,
        { received: byName.map(e => e.id) },
      ),
    }
  }
  return { ok: true, id: byName[0]!.id }
}

function compareResolvedDates(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime()
}

function validateDuplicateFields(
  fields: readonly string[],
  pathPrefix: string,
  code: typeof PERSPECTIVE_INPUT_ERROR_CODE.DUPLICATE_SORT_KEY
    | typeof PERSPECTIVE_INPUT_ERROR_CODE.DUPLICATE_GROUP_KEY,
): PerspectiveInputError[] {
  const seen = new Set<string>()
  const errors: PerspectiveInputError[] = []
  for (let i = 0; i < fields.length; i++) {
    const key = fields[i]!
    if (seen.has(key)) {
      errors.push(err(
        `${pathPrefix}[${i}]`,
        code,
        `重复字段 ${key}`,
        { received: key },
      ))
    }
    seen.add(key)
  }
  return errors
}

function expectedValueDescription(field: string, op: string): string {
  if (isNullaryOp(op))
    return '无 value'
  if (isStatusField(field)) {
    return op === FILTER_OP.IN ? 'ExplicitStatus[]' : 'ExplicitStatus'
  }
  if (isFlaggedField(field))
    return 'boolean'
  if (isNumericField(field)) {
    return op === FILTER_OP.BETWEEN ? '[number, number]' : 'number（分钟）'
  }
  if (isDateField(field)) {
    if (op === FILTER_OP.BETWEEN)
      return '[TemporalValue, TemporalValue]'
    return 'TemporalValue'
  }
  if (isEntityField(field)) {
    return op === FILTER_OP.IN ? 'EntityRef[]' : 'EntityRef'
  }
  return 'unknown'
}

function resolveFilterRule(
  rule: FilterRuleInput,
  path: string,
  context: PerspectiveResolutionContext,
  allowRelative: boolean,
): { ok: true, value: ResolvedFilterRule } | { ok: false, errors: PerspectiveInputError[] } {
  const errors: PerspectiveInputError[] = []
  const allowed = allowedOpsForField(rule.field)
  if (!allowed.includes(rule.op)) {
    errors.push(err(
      `${path}.op`,
      PERSPECTIVE_INPUT_ERROR_CODE.INVALID_FIELD_OP,
      `字段 ${rule.field} 不支持运算符 ${rule.op}`,
      { expected: allowed, received: rule.op },
    ))
    return { ok: false, errors }
  }

  if (isNullaryOp(rule.op)) {
    if (rule.value !== undefined && rule.value !== null) {
      errors.push(err(
        `${path}.value`,
        PERSPECTIVE_INPUT_ERROR_CODE.INVALID_VALUE_SHAPE,
        `${rule.op} 不需要 value`,
        { expected: null, received: rule.value },
      ))
      return { ok: false, errors }
    }
    return { ok: true, value: { field: rule.field, op: rule.op, value: null } }
  }

  if (isStatusField(rule.field)) {
    if (rule.op === FILTER_OP.IN) {
      const parsed = z.array(ExplicitStatusSchema).safeParse(rule.value)
      if (!parsed.success) {
        errors.push(err(
          `${path}.value`,
          PERSPECTIVE_INPUT_ERROR_CODE.INVALID_VALUE_SHAPE,
          'status in 需要 ExplicitStatus[]',
          { expected: 'ExplicitStatus[]', received: rule.value },
        ))
        return { ok: false, errors }
      }
      return { ok: true, value: { field: rule.field, op: rule.op, value: parsed.data } }
    }
    const parsed = ExplicitStatusSchema.safeParse(rule.value)
    if (!parsed.success) {
      errors.push(err(
        `${path}.value`,
        PERSPECTIVE_INPUT_ERROR_CODE.INVALID_VALUE_SHAPE,
        'status eq/ne 需要 ExplicitStatus',
        { expected: 'ExplicitStatus', received: rule.value },
      ))
      return { ok: false, errors }
    }
    return { ok: true, value: { field: rule.field, op: rule.op, value: parsed.data } }
  }

  if (isFlaggedField(rule.field)) {
    const parsed = z.boolean().safeParse(rule.value)
    if (!parsed.success) {
      errors.push(err(
        `${path}.value`,
        PERSPECTIVE_INPUT_ERROR_CODE.INVALID_VALUE_SHAPE,
        'flagged eq/ne 需要 boolean',
        { expected: 'boolean', received: rule.value },
      ))
      return { ok: false, errors }
    }
    return { ok: true, value: { field: rule.field, op: rule.op, value: parsed.data } }
  }

  if (isNumericField(rule.field)) {
    if (rule.op === FILTER_OP.BETWEEN) {
      const parsed = z.tuple([z.number(), z.number()]).safeParse(rule.value)
      if (!parsed.success || parsed.data[0] > parsed.data[1]) {
        errors.push(err(
          `${path}.value`,
          parsed.success
            ? PERSPECTIVE_INPUT_ERROR_CODE.INVALID_DATE_RANGE
            : PERSPECTIVE_INPUT_ERROR_CODE.INVALID_VALUE_SHAPE,
          parsed.success ? 'estimate between 起止需升序' : 'estimate between 需要 [number, number]',
          { expected: '[number, number]', received: rule.value },
        ))
        return { ok: false, errors }
      }
      return { ok: true, value: { field: rule.field, op: rule.op, value: parsed.data } }
    }
    const parsed = z.number().safeParse(rule.value)
    if (!parsed.success) {
      errors.push(err(
        `${path}.value`,
        PERSPECTIVE_INPUT_ERROR_CODE.INVALID_VALUE_SHAPE,
        'estimate 比较需要 number（分钟）',
        { expected: 'number', received: rule.value },
      ))
      return { ok: false, errors }
    }
    return { ok: true, value: { field: rule.field, op: rule.op, value: parsed.data } }
  }

  if (isDateField(rule.field)) {
    if (rule.op === FILTER_OP.BETWEEN) {
      const pair = parseTemporalPair(rule.value)
      if (!pair) {
        errors.push(err(
          `${path}.value`,
          PERSPECTIVE_INPUT_ERROR_CODE.INVALID_VALUE_SHAPE,
          '日期 between 需要 [TemporalValue, TemporalValue]',
          { expected: '[TemporalValue, TemporalValue]', received: rule.value },
        ))
        return { ok: false, errors }
      }
      const resolved: string[] = []
      for (let i = 0; i < pair.length; i++) {
        const r = resolveTemporalValue(pair[i]!, context.now, context.timeZone, allowRelative)
        if (!r.ok) {
          errors.push(err(
            `${path}.value[${i}]`,
            r.code,
            r.code === PERSPECTIVE_INPUT_ERROR_CODE.INVALID_DATE_TOKEN
              ? '持久透视不接受相对日期；Query 仅支持白名单 token'
              : '日期值无效',
            { received: pair[i] },
          ))
          return { ok: false, errors }
        }
        resolved.push(r.value)
      }
      if (compareResolvedDates(resolved[0]!, resolved[1]!) > 0) {
        errors.push(err(
          `${path}.value`,
          PERSPECTIVE_INPUT_ERROR_CODE.INVALID_DATE_RANGE,
          '日期 between 起止需升序',
          { expected: 'from <= to', received: resolved },
        ))
        return { ok: false, errors }
      }
      return { ok: true, value: { field: rule.field, op: rule.op, value: resolved } }
    }

    const temporal = parseTemporalValue(rule.value)
    if (!temporal) {
      errors.push(err(
        `${path}.value`,
        PERSPECTIVE_INPUT_ERROR_CODE.INVALID_VALUE_SHAPE,
        '日期运算符需要 TemporalValue',
        { expected: 'TemporalValue', received: rule.value },
      ))
      return { ok: false, errors }
    }
    const resolved = resolveTemporalValue(temporal, context.now, context.timeZone, allowRelative)
    if (!resolved.ok) {
      errors.push(err(
        `${path}.value`,
        resolved.code,
        resolved.code === PERSPECTIVE_INPUT_ERROR_CODE.INVALID_DATE_TOKEN
          ? '持久透视不接受相对日期；Query 仅支持白名单 token'
          : '日期值无效',
        { received: temporal },
      ))
      return { ok: false, errors }
    }
    return { ok: true, value: { field: rule.field, op: rule.op, value: resolved.value } }
  }

  const kind = entityKindForField(rule.field)
  if (kind) {
    if (rule.op === FILTER_OP.IN) {
      const refs = parseEntityRefArray(rule.value)
      if (!refs) {
        errors.push(err(
          `${path}.value`,
          PERSPECTIVE_INPUT_ERROR_CODE.INVALID_VALUE_SHAPE,
          `${rule.field} in 需要 EntityRef[]`,
          { expected: 'EntityRef[]', received: rule.value },
        ))
        return { ok: false, errors }
      }
      const ids: string[] = []
      for (let i = 0; i < refs.length; i++) {
        const resolved = resolveEntityRef(refs[i]!, kind, context)
        if (!resolved.ok) {
          errors.push({ ...resolved.error, path: `${path}.value[${i}]` })
          return { ok: false, errors }
        }
        ids.push(resolved.id)
      }
      return { ok: true, value: { field: rule.field, op: rule.op, value: ids } }
    }

    const ref = parseEntityRef(rule.value)
    if (!ref) {
      errors.push(err(
        `${path}.value`,
        PERSPECTIVE_INPUT_ERROR_CODE.INVALID_VALUE_SHAPE,
        `${rule.field} eq/ne 需要 EntityRef`,
        { expected: 'EntityRef', received: rule.value },
      ))
      return { ok: false, errors }
    }
    const resolved = resolveEntityRef(ref, kind, context)
    if (!resolved.ok) {
      errors.push({ ...resolved.error, path: `${path}.value` })
      return { ok: false, errors }
    }
    return { ok: true, value: { field: rule.field, op: rule.op, value: resolved.id } }
  }

  errors.push(err(
    `${path}.value`,
    PERSPECTIVE_INPUT_ERROR_CODE.INVALID_VALUE_SHAPE,
    `无法解析 field=${rule.field} op=${rule.op} 的 value`,
    { expected: expectedValueDescription(rule.field, rule.op), received: rule.value },
  ))
  return { ok: false, errors }
}

function zodIssuesToErrors(issues: z.ZodIssue[]): PerspectiveInputError[] {
  return issues.map(issue => ({
    path: issue.path.join('.'),
    code: PERSPECTIVE_INPUT_ERROR_CODE.INVALID_SHAPE,
    message: issue.message,
    received: issue,
  }))
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
      errors.push(err('name', PERSPECTIVE_INPUT_ERROR_CODE.EMPTY_NAME, '透视名称不能为空'))
    }
  }

  if (
    options.perspectiveId
    && context.builtinPerspectiveIds?.includes(options.perspectiveId)
  ) {
    errors.push(err(
      'id',
      PERSPECTIVE_INPUT_ERROR_CODE.BUILTIN_ID_RESERVED,
      `内置透视 ${options.perspectiveId} 不可修改`,
      { received: options.perspectiveId },
    ))
  }

  errors.push(...validateDuplicateFields(data.groupBy, 'groupBy', PERSPECTIVE_INPUT_ERROR_CODE.DUPLICATE_GROUP_KEY))
  errors.push(...validateDuplicateFields(
    data.sortBy.map(k => k.field),
    'sortBy',
    PERSPECTIVE_INPUT_ERROR_CODE.DUPLICATE_SORT_KEY,
  ))

  if (errors.length > 0)
    return { ok: false, errors }

  const filterRules: ResolvedFilterRule[] = []
  for (let i = 0; i < data.filterRules.length; i++) {
    const resolved = resolveFilterRule(
      data.filterRules[i]!,
      `filterRules[${i}]`,
      context,
      allowRelative,
    )
    if (!resolved.ok)
      return { ok: false, errors: resolved.errors }
    filterRules.push(resolved.value)
  }

  const spec: ResolvedPerspectiveSpec = {
    matchMode: data.matchMode,
    filterRules,
    groupBy: data.groupBy,
    sortBy: data.sortBy,
    availabilityFilter: data.availabilityFilter,
    showCompleted: data.showCompleted,
    showDropped: data.showDropped,
    flaggedOnly: data.flaggedOnly,
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

/** 将 ResolvedPerspectiveSpec 转为可传入 renderPerspective 的 FilterRule 列表 */
export function toPerspectiveFilterRules(rules: ResolvedFilterRule[]): FilterRule[] {
  return rules.map(r => ({ field: r.field, op: r.op, value: r.value }))
}

/** 由 ResolvedPerspectiveSpec 构造一次性查询用 Perspective 壳（不落库） */
export function toQueryPerspective(
  spec: ResolvedPerspectiveSpec,
  id = '__query__',
): import('./schema').Perspective {
  const now = new Date().toISOString()
  return {
    id,
    name: spec.name ?? 'Query',
    icon: spec.icon ?? null,
    matchMode: spec.matchMode ?? PERSPECTIVE_MATCH.ALL,
    filterRules: toPerspectiveFilterRules(spec.filterRules),
    groupBy: spec.groupBy,
    sortBy: spec.sortBy,
    availabilityFilter: spec.availabilityFilter ?? AVAILABILITY_FILTER.AVAILABLE,
    showCompleted: spec.showCompleted,
    showDropped: spec.showDropped,
    flaggedOnly: spec.flaggedOnly,
    createdAt: now,
    updatedAt: null,
  }
}

/** 生成 field × operator 矩阵 Markdown（Prompt 注入） */
export function formatFilterMatrixMarkdown(): string {
  const lines = ['| Field | Operators | Value |', '|-------|-----------|-------|']
  const valueHints: Record<string, string> = {
    [FILTER_FIELD.STATUS]: 'ExplicitStatus / ExplicitStatus[]',
    [FILTER_FIELD.PROJECT]: 'EntityRef / EntityRef[] / 无',
    [FILTER_FIELD.FOLDER]: 'EntityRef / EntityRef[] / 无',
    [FILTER_FIELD.TAG]: 'EntityRef（包含语义）/ EntityRef[] / 无',
    [FILTER_FIELD.DEFER_DATE]: 'TemporalValue / [TemporalValue, TemporalValue] / 无',
    [FILTER_FIELD.DUE_DATE]: 'TemporalValue / [TemporalValue, TemporalValue] / 无',
    [FILTER_FIELD.FLAGGED]: 'boolean',
    [FILTER_FIELD.ESTIMATE]: 'number（分钟）；before/after=小于/大于',
  }
  for (const field of Object.values(FILTER_FIELD)) {
    const ops = allowedOpsForField(field).join(', ')
    lines.push(`| \`${field}\` | ${ops} | ${valueHints[field] ?? ''} |`)
  }
  return lines.join('\n')
}
