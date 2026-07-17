import { describe, expect, it } from 'vitest'
import { FILTER_FIELD_OPS, LEAF_OP, LOGIC_OP } from './filter'
import {
  allowedOpsForField,
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
    expect(FILTER_FIELD_OPS.status).toContain(LEAF_OP.IS)
    expect(FILTER_FIELD_OPS.flagged).toEqual([LEAF_OP.IS, LEAF_OP.IS_NOT])
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

function baseInput(filter: unknown) {
  return {
    availabilityFilter: 'all',
    showCompleted: false,
    showDropped: false,
    flaggedOnly: null,
    filter,
    groupBy: [],
    sortBy: [],
  }
}

describe('validatePerspectiveInput', () => {
  it('query 接受相对日期', () => {
    const result = validatePerspectiveInput(baseInput({
      op: LEAF_OP.BEFORE,
      field: FILTER_FIELD.DUE_DATE,
      value: { type: 'relative', value: 'tomorrow' },
    }), baseContext, { mode: 'query' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.value.filter as { value: unknown }).value).toMatch(/^\d{4}-/)
    }
  })

  it('persist 拒绝相对日期', () => {
    const result = validatePerspectiveInput({
      name: '测试',
      ...baseInput({
        op: LEAF_OP.BEFORE,
        field: FILTER_FIELD.DUE_DATE,
        value: { type: 'relative', value: 'today' },
      }),
    }, baseContext, { mode: 'persist' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const code = PERSPECTIVE_INPUT_ERROR_CODE.INVALID_DATE_TOKEN
      expect(result.errors.some(e => e.code === code)).toBe(true)
    }
  })

  it('persist 接受绝对日期', () => {
    const iso = '2026-07-20T00:00:00.000Z'
    const result = validatePerspectiveInput({
      name: '截止',
      ...baseInput({
        op: LEAF_OP.BEFORE,
        field: FILTER_FIELD.DUE_DATE,
        value: { type: 'absolute', value: iso },
      }),
    }, baseContext, { mode: 'persist' })
    expect(result.ok).toBe(true)
    if (result.ok)
      expect((result.value.filter as { value: unknown }).value).toBe(iso)
  })

  it('eMPTY_NAME', () => {
    const result = validatePerspectiveInput({
      name: '   ',
      ...baseInput(null),
    }, baseContext, { mode: 'persist' })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.errors[0]?.code).toBe(PERSPECTIVE_INPUT_ERROR_CODE.EMPTY_NAME)
  })

  it('iNVALID_FIELD_OP', () => {
    const result = validatePerspectiveInput(baseInput({
      op: LEAF_OP.WITHIN,
      field: FILTER_FIELD.FLAGGED,
      value: [1, 2],
    }), baseContext, { mode: 'query' })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.errors[0]?.code).toBe(PERSPECTIVE_INPUT_ERROR_CODE.INVALID_FIELD_OP)
  })

  it('iNVALID_DATE_RANGE within 倒置', () => {
    const result = validatePerspectiveInput(baseInput({
      op: LEAF_OP.WITHIN,
      field: FILTER_FIELD.DUE_DATE,
      value: [
        { type: 'absolute', value: '2026-07-20T00:00:00.000Z' },
        { type: 'absolute', value: '2026-07-10T00:00:00.000Z' },
      ],
    }), baseContext, { mode: 'query' })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.errors[0]?.code).toBe(PERSPECTIVE_INPUT_ERROR_CODE.INVALID_DATE_RANGE)
  })

  it('dUPLICATE_SORT_KEY', () => {
    const result = validatePerspectiveInput({
      ...baseInput(null),
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
      ...baseInput(null),
    }, baseContext, { mode: 'persist', perspectiveId: 'inbox' })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.errors[0]?.code).toBe(PERSPECTIVE_INPUT_ERROR_CODE.BUILTIN_ID_RESERVED)
  })

  it('实体引用解析为 id（嵌套 some）', () => {
    const result = validatePerspectiveInput({
      name: '装修',
      ...baseInput({
        op: LEAF_OP.SOME,
        field: FILTER_FIELD.PROJECT,
        value: [{ name: '装修' }],
      }),
    }, baseContext, { mode: 'persist' })
    expect(result.ok).toBe(true)
    if (result.ok)
      expect((result.value.filter as { value: unknown }).value).toEqual(['p1'])
  })

  it('estimate 规则保留 number', () => {
    const result = validatePerspectiveInput(baseInput({
      op: LEAF_OP.BEFORE,
      field: FILTER_FIELD.ESTIMATE,
      value: 60,
    }), baseContext, { mode: 'query' })
    expect(result.ok).toBe(true)
    if (result.ok)
      expect((result.value.filter as { value: unknown }).value).toBe(60)
  })

  it('嵌套 and/or 树通过校验', () => {
    const result = validatePerspectiveInput(baseInput({
      op: LOGIC_OP.OR,
      children: [
        { op: LEAF_OP.IS, field: FILTER_FIELD.FLAGGED, value: true },
        { op: LOGIC_OP.NOT, child: { op: LEAF_OP.EMPTY, field: FILTER_FIELD.TAG } },
      ],
    }), baseContext, { mode: 'query' })
    expect(result.ok).toBe(true)
  })
})

describe('zod input schemas', () => {
  it('perspectiveQuerySchema 不要求 name', () => {
    expect(PerspectiveQuerySchema.safeParse(baseInput(null)).success).toBe(true)
  })

  it('perspectiveInputSchema 要求 name', () => {
    expect(PerspectiveInputSchema.safeParse(baseInput(null)).success).toBe(false)
  })
})
