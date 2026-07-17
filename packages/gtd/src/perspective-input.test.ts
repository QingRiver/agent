import { describe, expect, it } from 'vitest'
import {
  allowedOpsForField,
  FILTER_FIELD_OPS,
  PERSPECTIVE_INPUT_ERROR_CODE,
  PerspectiveInputSchema,
  PerspectiveQuerySchema,
  resolveEntityRef,
  resolveRelativeDateToken,
  startOfZonedDay,
  validatePerspectiveInput,
} from './perspective-input'
import {
  FILTER_FIELD,
  FILTER_OP,
  SORT_DIR,
  SORT_FIELD,
} from './types'

const NOW = new Date('2026-07-16T12:00:00Z')
const TZ = 'Asia/Shanghai'

const baseContext = {
  now: NOW,
  timeZone: TZ,
  projects: [
    { id: 'p1', name: '装修' },
    { id: 'p2', name: '工作' },
    { id: 'p-dup-a', name: '重复' },
    { id: 'p-dup-b', name: '重复' },
  ],
  folders: [{ id: 'f1', name: '家庭', parentId: null }],
  tags: [{ id: 't1', name: '紧急', parentId: null }],
  builtinPerspectiveIds: ['inbox'],
}

describe('fILTER_FIELD_OPS matrix', () => {
  it('每个 field 至少有一个 operator', () => {
    for (const field of Object.values(FILTER_FIELD))
      expect(allowedOpsForField(field).length).toBeGreaterThan(0)
  })

  it('与导出常量一致', () => {
    expect(FILTER_FIELD_OPS.status).toContain(FILTER_OP.IN)
    expect(FILTER_FIELD_OPS.flagged).toEqual([FILTER_OP.EQ, FILTER_OP.NE])
  })
})

describe('resolveRelativeDateToken', () => {
  it('today 在固定时区下稳定', () => {
    const iso = resolveRelativeDateToken('today', NOW, TZ)
    expect(iso).toBe(startOfZonedDay(NOW, TZ).toISOString())
  })

  it('start_of_week / end_of_week 可解析', () => {
    expect(resolveRelativeDateToken('start_of_week', NOW, TZ)).toMatch(/^\d{4}-/)
    expect(resolveRelativeDateToken('end_of_week', NOW, TZ)).toMatch(/^\d{4}-/)
  })

  it('+3d / -1w', () => {
    expect(resolveRelativeDateToken('+3d', NOW, TZ)).toBeTruthy()
    expect(resolveRelativeDateToken('-1w', NOW, TZ)).toBeTruthy()
  })

  it('非法 token 返回 null', () => {
    expect(resolveRelativeDateToken('next monday', NOW, TZ)).toBeNull()
  })
})

describe('resolveEntityRef', () => {
  it('按 id 解析', () => {
    const r = resolveEntityRef({ id: 'p1' }, 'project', baseContext)
    expect(r).toEqual({ ok: true, id: 'p1' })
  })

  it('按 name 精确匹配', () => {
    const r = resolveEntityRef({ name: '装修' }, 'project', baseContext)
    expect(r).toEqual({ ok: true, id: 'p1' })
  })

  it('rEF_NOT_FOUND', () => {
    const r = resolveEntityRef({ name: '不存在' }, 'project', baseContext)
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.error.code).toBe(PERSPECTIVE_INPUT_ERROR_CODE.REF_NOT_FOUND)
  })

  it('aMBIGUOUS_REF', () => {
    const r = resolveEntityRef({ name: '重复' }, 'project', baseContext)
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.error.code).toBe(PERSPECTIVE_INPUT_ERROR_CODE.AMBIGUOUS_REF)
  })

  it('rEF_CONFLICT', () => {
    const r = resolveEntityRef({ id: 'p1', name: '工作' }, 'project', baseContext)
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.error.code).toBe(PERSPECTIVE_INPUT_ERROR_CODE.REF_CONFLICT)
  })
})

describe('validatePerspectiveInput', () => {
  it('query 接受相对日期', () => {
    const result = validatePerspectiveInput({
      matchMode: 'all',
      availabilityFilter: 'available',
      showCompleted: false,
      showDropped: false,
      flaggedOnly: null,
      filterRules: [{
        field: FILTER_FIELD.DUE_DATE,
        op: FILTER_OP.BEFORE,
        value: { type: 'relative', value: 'tomorrow' },
      }],
      groupBy: [],
      sortBy: [],
    }, baseContext, { mode: 'query' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.filterRules[0]?.value).toMatch(/^\d{4}-/)
    }
  })

  it('persist 拒绝相对日期', () => {
    const result = validatePerspectiveInput({
      name: '测试',
      matchMode: 'all',
      availabilityFilter: 'available',
      showCompleted: false,
      showDropped: false,
      flaggedOnly: null,
      filterRules: [{
        field: FILTER_FIELD.DUE_DATE,
        op: FILTER_OP.EQ,
        value: { type: 'relative', value: 'today' },
      }],
      groupBy: [],
      sortBy: [],
    }, baseContext, { mode: 'persist' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const hasDateTokenError = result.errors.some(
        e => e.code === PERSPECTIVE_INPUT_ERROR_CODE.INVALID_DATE_TOKEN,
      )
      expect(hasDateTokenError).toBe(true)
    }
  })

  it('persist 接受绝对日期', () => {
    const iso = '2026-07-20T00:00:00.000Z'
    const result = validatePerspectiveInput({
      name: '截止',
      matchMode: 'all',
      availabilityFilter: 'all',
      showCompleted: false,
      showDropped: false,
      flaggedOnly: null,
      filterRules: [{
        field: FILTER_FIELD.DUE_DATE,
        op: FILTER_OP.EQ,
        value: { type: 'absolute', value: iso },
      }],
      groupBy: [],
      sortBy: [],
    }, baseContext, { mode: 'persist' })
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.value.filterRules[0]?.value).toBe(iso)
  })

  it('eMPTY_NAME', () => {
    const result = validatePerspectiveInput({
      name: '   ',
      matchMode: 'all',
      availabilityFilter: 'all',
      showCompleted: false,
      showDropped: false,
      flaggedOnly: null,
      filterRules: [],
      groupBy: [],
      sortBy: [],
    }, baseContext, { mode: 'persist' })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.errors[0]?.code).toBe(PERSPECTIVE_INPUT_ERROR_CODE.EMPTY_NAME)
  })

  it('iNVALID_FIELD_OP', () => {
    const result = validatePerspectiveInput({
      matchMode: 'all',
      availabilityFilter: 'all',
      showCompleted: false,
      showDropped: false,
      flaggedOnly: null,
      filterRules: [{ field: FILTER_FIELD.FLAGGED, op: FILTER_OP.BETWEEN, value: [1, 2] }],
      groupBy: [],
      sortBy: [],
    }, baseContext, { mode: 'query' })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.errors[0]?.code).toBe(PERSPECTIVE_INPUT_ERROR_CODE.INVALID_FIELD_OP)
  })

  it('iNVALID_DATE_RANGE between 倒置', () => {
    const result = validatePerspectiveInput({
      matchMode: 'all',
      availabilityFilter: 'all',
      showCompleted: false,
      showDropped: false,
      flaggedOnly: null,
      filterRules: [{
        field: FILTER_FIELD.DUE_DATE,
        op: FILTER_OP.BETWEEN,
        value: [
          { type: 'absolute', value: '2026-07-20T00:00:00.000Z' },
          { type: 'absolute', value: '2026-07-10T00:00:00.000Z' },
        ],
      }],
      groupBy: [],
      sortBy: [],
    }, baseContext, { mode: 'query' })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.errors[0]?.code).toBe(PERSPECTIVE_INPUT_ERROR_CODE.INVALID_DATE_RANGE)
  })

  it('dUPLICATE_SORT_KEY', () => {
    const result = validatePerspectiveInput({
      matchMode: 'all',
      availabilityFilter: 'all',
      showCompleted: false,
      showDropped: false,
      flaggedOnly: null,
      filterRules: [],
      groupBy: [],
      sortBy: [
        { field: SORT_FIELD.DUE_DATE, dir: SORT_DIR.ASC },
        { field: SORT_FIELD.DUE_DATE, dir: SORT_DIR.DESC },
      ],
    }, baseContext, { mode: 'query' })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.errors[0]?.code).toBe(PERSPECTIVE_INPUT_ERROR_CODE.DUPLICATE_SORT_KEY)
  })

  it('bUILTIN_ID_RESERVED', () => {
    const result = validatePerspectiveInput({
      name: '改 Inbox',
      matchMode: 'all',
      availabilityFilter: 'all',
      showCompleted: false,
      showDropped: false,
      flaggedOnly: null,
      filterRules: [],
      groupBy: [],
      sortBy: [],
    }, baseContext, { mode: 'persist', perspectiveId: 'inbox' })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.errors[0]?.code).toBe(PERSPECTIVE_INPUT_ERROR_CODE.BUILTIN_ID_RESERVED)
  })

  it('实体引用解析为 id', () => {
    const result = validatePerspectiveInput({
      name: '装修',
      matchMode: 'all',
      availabilityFilter: 'remaining',
      showCompleted: false,
      showDropped: false,
      flaggedOnly: null,
      filterRules: [{
        field: FILTER_FIELD.PROJECT,
        op: FILTER_OP.EQ,
        value: { name: '装修' },
      }],
      groupBy: [],
      sortBy: [],
    }, baseContext, { mode: 'persist' })
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.value.filterRules[0]?.value).toBe('p1')
  })

  it('estimate 规则保留 number', () => {
    const result = validatePerspectiveInput({
      matchMode: 'all',
      availabilityFilter: 'all',
      showCompleted: false,
      showDropped: false,
      flaggedOnly: null,
      filterRules: [{
        field: FILTER_FIELD.ESTIMATE,
        op: FILTER_OP.BEFORE,
        value: 60,
      }],
      groupBy: [],
      sortBy: [],
    }, baseContext, { mode: 'query' })
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.value.filterRules[0]?.value).toBe(60)
  })
})

describe('zod input schemas', () => {
  it('perspectiveQuerySchema 不要求 name', () => {
    expect(PerspectiveQuerySchema.safeParse({
      matchMode: 'all',
      availabilityFilter: 'all',
      showCompleted: false,
      showDropped: false,
      flaggedOnly: null,
      filterRules: [],
      groupBy: [],
      sortBy: [],
    }).success).toBe(true)
  })

  it('perspectiveInputSchema 要求 name', () => {
    expect(PerspectiveInputSchema.safeParse({
      matchMode: 'all',
      availabilityFilter: 'all',
      showCompleted: false,
      showDropped: false,
      flaggedOnly: null,
      filterRules: [],
      groupBy: [],
      sortBy: [],
    }).success).toBe(false)
  })
})
