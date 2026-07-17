import type { FilterNode } from './schema'
import type { PerspectiveResolutionContext } from './validate'
import { describe, expect, it } from 'vitest'
import { NOW } from '../__tests__/fixtures'
import { FILTER_ERROR_CODE, FILTER_FIELD, FILTER_LIMITS, LEAF_OP, LOGIC_OP } from './schema'
import { validateFilterNode } from './validate'

const context: PerspectiveResolutionContext = {
  now: NOW,
  timeZone: 'UTC',
  projects: [{ id: 'p1', name: 'Proj' }],
  folders: [{ id: 'f1', name: 'Folder', parentId: null }],
  tags: [{ id: 't1', name: 'Tag1', parentId: null }, { id: 't2', name: 'Tag1', parentId: null }],
}

function leaf(field: string, op: string, value?: unknown): FilterNode {
  return (value === undefined ? { op, field } : { op, field, value }) as FilterNode
}

function validate(node: unknown, allowRelative = false) {
  return validateFilterNode(node, context, { allowRelative })
}

describe('validateFilterNode - 合法树', () => {
  it('单叶子通过', () => {
    const r = validate(leaf(FILTER_FIELD.STATUS, LEAF_OP.IS, 'active'))
    expect(r.ok).toBe(true)
    if (r.ok)
      expect(r.value).toEqual({ op: 'is', field: 'status', value: 'active' })
  })

  it('and/or/not 嵌套通过', () => {
    const node: FilterNode = {
      op: LOGIC_OP.OR,
      children: [
        { op: LOGIC_OP.AND, children: [leaf(FILTER_FIELD.FLAGGED, LEAF_OP.IS, true), leaf(FILTER_FIELD.STATUS, LEAF_OP.IS, 'active')] },
        { op: LOGIC_OP.NOT, child: leaf(FILTER_FIELD.TAG, LEAF_OP.SOME, [{ id: 't1' }]) },
      ],
    }
    const r = validate(node)
    expect(r.ok).toBe(true)
    if (r.ok) {
      // tag some 解析为 id 数组
      const notNode = (r.value as { children: FilterNode[] }).children[1] as { child: FilterNode }
      expect(notNode.child).toEqual({ op: 'some', field: 'tag', value: ['t1'] })
    }
  })

  it('nullary 操作符不需要 value', () => {
    expect(validate(leaf(FILTER_FIELD.PROJECT, LEAF_OP.EMPTY)).ok).toBe(true)
    expect(validate(leaf(FILTER_FIELD.DUE_DATE, LEAF_OP.EXIST)).ok).toBe(true)
  })
})

describe('validateFilterNode - 实体引用解析', () => {
  it('by id 解析', () => {
    const r = validate(leaf(FILTER_FIELD.PROJECT, LEAF_OP.SOME, [{ id: 'p1' }]))
    expect(r.ok).toBe(true)
    if (r.ok)
      expect((r.value as { value: unknown }).value).toEqual(['p1'])
  })

  it('by name 解析', () => {
    const r = validate(leaf(FILTER_FIELD.PROJECT, LEAF_OP.SOME, [{ name: 'Proj' }]))
    expect(r.ok).toBe(true)
    if (r.ok)
      expect((r.value as { value: unknown }).value).toEqual(['p1'])
  })

  it('未找到 id 报 REF_NOT_FOUND', () => {
    const r = validate(leaf(FILTER_FIELD.PROJECT, LEAF_OP.SOME, [{ id: 'nope' }]))
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errors[0]!.code).toBe(FILTER_ERROR_CODE.REF_NOT_FOUND)
  })

  it('name 匹配多个报 AMBIGUOUS_REF', () => {
    const r = validate(leaf(FILTER_FIELD.TAG, LEAF_OP.SOME, [{ name: 'Tag1' }]))
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errors[0]!.code).toBe(FILTER_ERROR_CODE.AMBIGUOUS_REF)
  })
})

describe('validateFilterNode - 日期解析', () => {
  it('绝对日期通过（persist 模式）', () => {
    const iso = NOW.toISOString()
    const r = validate(leaf(FILTER_FIELD.DUE_DATE, LEAF_OP.BEFORE, { type: 'absolute', value: iso }))
    expect(r.ok).toBe(true)
    if (r.ok)
      expect((r.value as { value: unknown }).value).toBe(iso)
  })

  it('相对日期 query 模式通过', () => {
    const r = validate(
      leaf(FILTER_FIELD.DUE_DATE, LEAF_OP.WITHIN, [
        { type: 'relative', value: 'today' },
        { type: 'relative', value: '+1w' },
      ]),
      true,
    )
    expect(r.ok).toBe(true)
  })

  it('相对日期 persist 模式被拒', () => {
    const r = validate(leaf(FILTER_FIELD.DUE_DATE, LEAF_OP.BEFORE, { type: 'relative', value: 'today' }), false)
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errors[0]!.code).toBe(FILTER_ERROR_CODE.INVALID_DATE_TOKEN)
  })

  it('within 起止倒序报 INVALID_DATE_RANGE', () => {
    const a = NOW.toISOString()
    const b = new Date(NOW.getTime() - 86400000).toISOString()
    const r = validate(leaf(FILTER_FIELD.DUE_DATE, LEAF_OP.WITHIN, [
      { type: 'absolute', value: a },
      { type: 'absolute', value: b },
    ]))
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errors[0]!.code).toBe(FILTER_ERROR_CODE.INVALID_DATE_RANGE)
  })
})

describe('validateFilterNode - field × op 矩阵', () => {
  it('status 不支持 some', () => {
    const r = validate(leaf(FILTER_FIELD.STATUS, LEAF_OP.SOME, ['active']))
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errors[0]!.code).toBe(FILTER_ERROR_CODE.INVALID_FIELD_OP)
  })

  it('tag 不支持 is', () => {
    const r = validate(leaf(FILTER_FIELD.TAG, LEAF_OP.IS, 'x'))
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errors[0]!.code).toBe(FILTER_ERROR_CODE.INVALID_FIELD_OP)
  })

  it('nullary 操作符带 value 被拒', () => {
    const r = validate(leaf(FILTER_FIELD.PROJECT, LEAF_OP.EMPTY, ['x']))
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errors[0]!.code).toBe(FILTER_ERROR_CODE.INVALID_VALUE_SHAPE)
  })
})

describe('validateFilterNode - 深度上限', () => {
  function chain(nots: number): FilterNode {
    let node: FilterNode = leaf(FILTER_FIELD.STATUS, LEAF_OP.IS, 'active')
    for (let i = 0; i < nots; i++)
      node = { op: LOGIC_OP.NOT, child: node }
    return node
  }

  it(`深度 ${FILTER_LIMITS.MAX_DEPTH} 通过（4 层 not）`, () => {
    expect(validate(chain(4)).ok).toBe(true)
  })

  it(`深度 ${FILTER_LIMITS.MAX_DEPTH + 1} 被拒`, () => {
    const r = validate(chain(5))
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errors[0]!.code).toBe(FILTER_ERROR_CODE.DEPTH_LIMIT)
  })
})

describe('validateFilterNode - 节点数上限', () => {
  it(`节点数 ${FILTER_LIMITS.MAX_NODES} 通过`, () => {
    const children = Array.from({ length: FILTER_LIMITS.MAX_NODES - 1 }, () => leaf(FILTER_FIELD.STATUS, LEAF_OP.IS, 'active'))
    const node: FilterNode = { op: LOGIC_OP.AND, children }
    expect(validate(node).ok).toBe(true)
  })

  it(`节点数 ${FILTER_LIMITS.MAX_NODES + 1} 被拒`, () => {
    const children = Array.from({ length: FILTER_LIMITS.MAX_NODES }, () => leaf(FILTER_FIELD.STATUS, LEAF_OP.IS, 'active'))
    const node: FilterNode = { op: LOGIC_OP.AND, children }
    const r = validate(node)
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errors[0]!.code).toBe(FILTER_ERROR_CODE.NODE_LIMIT)
  })
})

describe('validateFilterNode - 结构错误', () => {
  it('and 空子节点被拒', () => {
    const r = validate({ op: LOGIC_OP.AND, children: [] })
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errors[0]!.code).toBe(FILTER_ERROR_CODE.INVALID_SHAPE)
  })

  it('非法 op 形态被拒', () => {
    const r = validate({ op: 'xor', children: [] })
    expect(r.ok).toBe(false)
  })

  it('叶子缺 field 被拒', () => {
    const r = validate({ op: LEAF_OP.IS, value: 'active' })
    expect(r.ok).toBe(false)
  })
})
