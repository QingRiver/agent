import type { EntityRef, FilterNode, PerspectiveInputError, TemporalValue } from './schema'
import { z } from 'zod'
import { ExplicitStatusSchema } from '../schema'
import { FILTER_FIELD } from '../types'
import {

  allowedOpsForField,
  EntityRefSchema,

  FILTER_ERROR_CODE,
  FILTER_LIMITS,
  FilterNodeSchema,
  isDateField,
  isEntityField,
  isFlaggedField,
  isNullaryOp,
  isNumericField,
  isRelativeDateToken,
  isStatusField,
  LOGIC_OP,
  RELATIVE_DATE_LITERALS,
  TemporalValueSchema,

} from './schema'

/**
 * DSL 递归校验 + 解析层。
 *
 * 输入 {@link FilterNode}（含 EntityRef / TemporalValue），输出已解析的
 * {@link FilterNode}（EntityRef→id、相对日期→绝对 ISO）。
 *
 * 校验项：
 * - 结构合法（zod schema）
 * - 深度 ≤ {@link FILTER_LIMITS.MAX_DEPTH}、节点数 ≤ {@link FILTER_LIMITS.MAX_NODES}
 * - 每个叶子 op 必须在该 field 允许集内（field × op 矩阵）
 * - 叶子 value 形态与 op 配套
 * - 实体引用可解析、相对日期 token 合法（query 允许 / persist 仅绝对）
 */

// ===== 错误构造 =====

export function err(
  path: string,
  code: typeof FILTER_ERROR_CODE[keyof typeof FILTER_ERROR_CODE],
  message: string,
  extra?: Pick<PerspectiveInputError, 'expected' | 'received'>,
): PerspectiveInputError {
  return { path, code, message, ...extra }
}

function zodIssuesToErrors(issues: z.ZodIssue[]): PerspectiveInputError[] {
  return issues.map(issue => ({
    path: issue.path.join('.'),
    code: FILTER_ERROR_CODE.INVALID_SHAPE,
    message: issue.message,
    received: issue,
  }))
}

// ===== 解析上下文类型（原 PerspectiveResolutionContext，迁入此处） =====

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

/** 兼容别名 */
export type FilterResolutionContext = PerspectiveResolutionContext

// ===== 时区 / 相对日期解析（原 perspective-input，迁入此处） =====

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

  if (token === RELATIVE_DATE_LITERALS[0])
    return today.toISOString()
  if (token === RELATIVE_DATE_LITERALS[1])
    return addZonedDays(today, timeZone, 1).toISOString()
  if (token === RELATIVE_DATE_LITERALS[2])
    return startOfZonedWeek(now, timeZone).toISOString()
  if (token === RELATIVE_DATE_LITERALS[3])
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
): { ok: true, value: string } | { ok: false, code: typeof FILTER_ERROR_CODE.INVALID_DATE_TOKEN } {
  if (temporal.type === 'absolute')
    return { ok: true, value: temporal.value }

  if (!allowRelative)
    return { ok: false, code: FILTER_ERROR_CODE.INVALID_DATE_TOKEN }

  const resolved = resolveRelativeDateToken(temporal.value, now, timeZone)
  if (!resolved)
    return { ok: false, code: FILTER_ERROR_CODE.INVALID_DATE_TOKEN }

  return { ok: true, value: resolved }
}

function compareResolvedDates(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime()
}

// ===== 实体引用解析 =====

type EntityKind = 'project' | 'folder' | 'tag'

function entitiesForKind(
  context: PerspectiveResolutionContext,
  kind: EntityKind,
): PerspectiveEntityRef[] {
  switch (kind) {
    case 'project': return context.projects
    case 'folder': return context.folders
    case 'tag': return context.tags
  }
}

export function entityKindForField(field: string): EntityKind | null {
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
  const byName = ref.name ? entities.filter(e => e.name === ref.name) : []

  if (ref.id && ref.name) {
    if (!byId)
      return { ok: false, error: err('', FILTER_ERROR_CODE.REF_NOT_FOUND, `未找到 id=${ref.id}`) }
    if (byId.name !== ref.name) {
      return {
        ok: false,
        error: err(
          '',
          FILTER_ERROR_CODE.REF_CONFLICT,
          `id=${ref.id} 与 name=${ref.name} 指向不同实体`,
          { expected: byId.name, received: ref.name },
        ),
      }
    }
    return { ok: true, id: byId.id }
  }

  if (ref.id) {
    if (!byId)
      return { ok: false, error: err('', FILTER_ERROR_CODE.REF_NOT_FOUND, `未找到 id=${ref.id}`) }
    return { ok: true, id: byId.id }
  }

  if (byName.length === 0)
    return { ok: false, error: err('', FILTER_ERROR_CODE.REF_NOT_FOUND, `未找到 name=${ref.name}`) }
  if (byName.length > 1) {
    return {
      ok: false,
      error: err(
        '',
        FILTER_ERROR_CODE.AMBIGUOUS_REF,
        `name=${ref.name} 匹配 ${byName.length} 个实体，请改用 id`,
        { received: byName.map(e => e.id) },
      ),
    }
  }
  return { ok: true, id: byName[0]!.id }
}

// ===== value 形态解析 =====

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

function expectedValueDescription(field: string, op: string): string {
  if (isNullaryOp(op))
    return '无 value'
  if (isStatusField(field))
    return 'ExplicitStatus'
  if (isFlaggedField(field))
    return 'boolean'
  if (isNumericField(field))
    return op === 'within' ? '[number, number]' : 'number（分钟）'
  if (isDateField(field))
    return op === 'within' ? '[TemporalValue, TemporalValue]' : 'TemporalValue'
  if (isEntityField(field))
    return 'EntityRef[]'
  return 'unknown'
}

// ===== 叶子 value 解析 =====

function resolveLeafValue(
  node: { field: string, op: string, value?: unknown },
  path: string,
  context: PerspectiveResolutionContext,
  allowRelative: boolean,
): { ok: true, value: unknown } | { ok: false, errors: PerspectiveInputError[] } {
  const errors: PerspectiveInputError[] = []
  const { field, op, value } = node

  if (isNullaryOp(op)) {
    if (value !== undefined && value !== null) {
      errors.push(err(
        `${path}.value`,
        FILTER_ERROR_CODE.INVALID_VALUE_SHAPE,
        `${op} 不需要 value`,
        { expected: null, received: value },
      ))
      return { ok: false, errors }
    }
    return { ok: true, value: null }
  }

  if (isStatusField(field)) {
    const parsed = ExplicitStatusSchema.safeParse(value)
    if (!parsed.success) {
      errors.push(err(
        `${path}.value`,
        FILTER_ERROR_CODE.INVALID_VALUE_SHAPE,
        'status is/is_not 需要 ExplicitStatus',
        { expected: 'ExplicitStatus', received: value },
      ))
      return { ok: false, errors }
    }
    return { ok: true, value: parsed.data }
  }

  if (isFlaggedField(field)) {
    const parsed = z.boolean().safeParse(value)
    if (!parsed.success) {
      errors.push(err(
        `${path}.value`,
        FILTER_ERROR_CODE.INVALID_VALUE_SHAPE,
        'flagged is/is_not 需要 boolean',
        { expected: 'boolean', received: value },
      ))
      return { ok: false, errors }
    }
    return { ok: true, value: parsed.data }
  }

  if (isNumericField(field)) {
    if (op === 'within') {
      const parsed = z.tuple([z.number(), z.number()]).safeParse(value)
      if (!parsed.success || parsed.data[0] > parsed.data[1]) {
        errors.push(err(
          `${path}.value`,
          parsed.success
            ? FILTER_ERROR_CODE.INVALID_DATE_RANGE
            : FILTER_ERROR_CODE.INVALID_VALUE_SHAPE,
          parsed.success ? 'estimate within 起止需升序' : 'estimate within 需要 [number, number]',
          { expected: '[number, number]', received: value },
        ))
        return { ok: false, errors }
      }
      return { ok: true, value: parsed.data }
    }
    const parsed = z.number().safeParse(value)
    if (!parsed.success) {
      errors.push(err(
        `${path}.value`,
        FILTER_ERROR_CODE.INVALID_VALUE_SHAPE,
        'estimate 比较需要 number（分钟）',
        { expected: 'number', received: value },
      ))
      return { ok: false, errors }
    }
    return { ok: true, value: parsed.data }
  }

  if (isDateField(field)) {
    if (op === 'within') {
      const pair = parseTemporalPair(value)
      if (!pair) {
        errors.push(err(
          `${path}.value`,
          FILTER_ERROR_CODE.INVALID_VALUE_SHAPE,
          '日期 within 需要 [TemporalValue, TemporalValue]',
          { expected: '[TemporalValue, TemporalValue]', received: value },
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
            r.code === FILTER_ERROR_CODE.INVALID_DATE_TOKEN
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
          FILTER_ERROR_CODE.INVALID_DATE_RANGE,
          '日期 within 起止需升序',
          { expected: 'from <= to', received: resolved },
        ))
        return { ok: false, errors }
      }
      return { ok: true, value: resolved }
    }

    const temporal = parseTemporalValue(value)
    if (!temporal) {
      errors.push(err(
        `${path}.value`,
        FILTER_ERROR_CODE.INVALID_VALUE_SHAPE,
        '日期运算符需要 TemporalValue',
        { expected: 'TemporalValue', received: value },
      ))
      return { ok: false, errors }
    }
    const resolved = resolveTemporalValue(temporal, context.now, context.timeZone, allowRelative)
    if (!resolved.ok) {
      errors.push(err(
        `${path}.value`,
        resolved.code,
        resolved.code === FILTER_ERROR_CODE.INVALID_DATE_TOKEN
          ? '持久透视不接受相对日期；Query 仅支持白名单 token'
          : '日期值无效',
        { received: temporal },
      ))
      return { ok: false, errors }
    }
    return { ok: true, value: resolved.value }
  }

  // 实体字段：some
  const kind = entityKindForField(field)
  if (kind) {
    const refs = parseEntityRefArray(value)
    if (!refs) {
      errors.push(err(
        `${path}.value`,
        FILTER_ERROR_CODE.INVALID_VALUE_SHAPE,
        `${field} some 需要 EntityRef[]`,
        { expected: 'EntityRef[]', received: value },
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
    return { ok: true, value: ids }
  }

  errors.push(err(
    `${path}.value`,
    FILTER_ERROR_CODE.INVALID_VALUE_SHAPE,
    `无法解析 field=${field} op=${op} 的 value`,
    { expected: expectedValueDescription(field, op), received: value },
  ))
  return { ok: false, errors }
}

// ===== 递归校验 =====

/** 计算节点数（含自身） */
function countNodes(node: FilterNode): number {
  switch (node.op) {
    case LOGIC_OP.AND:
    case LOGIC_OP.OR:
      return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0)
    case LOGIC_OP.NOT:
      return 1 + countNodes(node.child)
    default:
      return 1
  }
}

/** 计算深度（叶子=1，每层逻辑 +1） */
function nodeDepth(node: FilterNode): number {
  switch (node.op) {
    case LOGIC_OP.AND:
    case LOGIC_OP.OR: {
      const childDepths = node.children.map(c => nodeDepth(c))
      return 1 + (node.children.length === 0 ? 0 : Math.max(...childDepths))
    }
    case LOGIC_OP.NOT:
      return 1 + nodeDepth(node.child)
    default:
      return 1
  }
}

function resolveNode(
  node: FilterNode,
  path: string,
  context: PerspectiveResolutionContext,
  allowRelative: boolean,
): { ok: true, value: FilterNode } | { ok: false, errors: PerspectiveInputError[] } {
  switch (node.op) {
    case LOGIC_OP.AND:
    case LOGIC_OP.OR: {
      if (node.children.length === 0) {
        return {
          ok: false,
          errors: [err(`${path}.children`, FILTER_ERROR_CODE.INVALID_SHAPE, `${node.op} 至少需要 1 个子节点`)],
        }
      }
      const children: FilterNode[] = []
      for (let i = 0; i < node.children.length; i++) {
        const r = resolveNode(node.children[i]!, `${path}.children[${i}]`, context, allowRelative)
        if (!r.ok)
          return r
        children.push(r.value)
      }
      return { ok: true, value: { op: node.op, children } }
    }
    case LOGIC_OP.NOT: {
      const r = resolveNode(node.child, `${path}.child`, context, allowRelative)
      if (!r.ok)
        return r
      return { ok: true, value: { op: LOGIC_OP.NOT, child: r.value } }
    }
    default: {
      // 叶子
      const allowed = allowedOpsForField(node.field)
      if (!allowed.includes(node.op)) {
        return {
          ok: false,
          errors: [err(
            `${path}.op`,
            FILTER_ERROR_CODE.INVALID_FIELD_OP,
            `字段 ${node.field} 不支持运算符 ${node.op}`,
            { expected: allowed, received: node.op },
          )],
        }
      }
      const v = resolveLeafValue(node, path, context, allowRelative)
      if (!v.ok)
        return v
      const leaf: FilterNode = { op: node.op, field: node.field, value: v.value }
      return { ok: true, value: leaf }
    }
  }
}

export interface ValidateFilterNodeOptions {
  /** query=true 允许相对日期；persist=false 仅绝对 ISO */
  allowRelative: boolean
}

/** 校验并解析整棵 filter 树 */
export function validateFilterNode(
  input: unknown,
  context: PerspectiveResolutionContext,
  options: ValidateFilterNodeOptions,
): { ok: true, value: FilterNode } | { ok: false, errors: PerspectiveInputError[] } {
  const parsed = FilterNodeSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, errors: zodIssuesToErrors(parsed.error.issues) }

  const node = parsed.data

  const depth = nodeDepth(node)
  if (depth > FILTER_LIMITS.MAX_DEPTH) {
    return {
      ok: false,
      errors: [err(
        '',
        FILTER_ERROR_CODE.DEPTH_LIMIT,
        `筛选树深度 ${depth} 超过上限 ${FILTER_LIMITS.MAX_DEPTH}`,
        { expected: FILTER_LIMITS.MAX_DEPTH, received: depth },
      )],
    }
  }

  const count = countNodes(node)
  if (count > FILTER_LIMITS.MAX_NODES) {
    return {
      ok: false,
      errors: [err(
        '',
        FILTER_ERROR_CODE.NODE_LIMIT,
        `筛选树节点数 ${count} 超过上限 ${FILTER_LIMITS.MAX_NODES}`,
        { expected: FILTER_LIMITS.MAX_NODES, received: count },
      )],
    }
  }

  return resolveNode(node, '', context, options.allowRelative)
}
