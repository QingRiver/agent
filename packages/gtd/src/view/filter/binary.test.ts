import { describe, expect, it } from 'vitest'
import { FILTER_FIELD } from '../../data/types'
import {
  appendToLogicChain,
  flattenSameLogicChain,
  foldLogic,
  setLogicChainOp,
  toBinaryFilterTree,
} from './binary'
import { LEAF_OP, LOGIC_OP } from './schema'

const a = { op: LEAF_OP.IS, field: FILTER_FIELD.FLAGGED, value: true } as const
const b = { op: LEAF_OP.IS, field: FILTER_FIELD.STATUS, value: 'active' } as const
const c = { op: LEAF_OP.SOME, field: FILTER_FIELD.PROJECT, value: ['p1'] } as const

describe('foldLogic / toBinaryFilterTree', () => {
  it('二元树恒等映射', () => {
    const binary = foldLogic(LOGIC_OP.AND, [a, b, c])
    expect(toBinaryFilterTree(binary)).toEqual(binary)
  })

  it('n-ary and 折叠为左结合二元', () => {
    const nary = { op: LOGIC_OP.AND, children: [a, b, c] }
    expect(toBinaryFilterTree(nary)).toEqual(foldLogic(LOGIC_OP.AND, [a, b, c]))
  })

  it('单子 and 解包为该子节点', () => {
    expect(toBinaryFilterTree({ op: LOGIC_OP.AND, children: [a] })).toEqual(a)
  })

  it('foldLogic 单节点原样', () => {
    expect(foldLogic(LOGIC_OP.OR, [a])).toEqual(a)
  })
})

describe('flattenSameLogicChain / append / setOp', () => {
  it('摊平左结合链', () => {
    const tree = foldLogic(LOGIC_OP.AND, [a, b, c])
    expect(flattenSameLogicChain(tree)).toEqual({ op: LOGIC_OP.AND, items: [a, b, c] })
  })

  it('右孩子同算子分组整颗保留', () => {
    const group = foldLogic(LOGIC_OP.AND, [b, c])
    const tree = foldLogic(LOGIC_OP.AND, [a, group])
    expect(flattenSameLogicChain(tree)).toEqual({ op: LOGIC_OP.AND, items: [a, group] })
  })

  it('链尾追加', () => {
    const root = foldLogic(LOGIC_OP.AND, [a, b])
    expect(flattenSameLogicChain(appendToLogicChain(root, LOGIC_OP.AND, c))?.items)
      .toEqual([a, b, c])
  })

  it('切换链算子', () => {
    const root = foldLogic(LOGIC_OP.AND, [a, b, c])
    const orTree = setLogicChainOp(root, LOGIC_OP.OR)
    expect(flattenSameLogicChain(orTree)).toEqual({ op: LOGIC_OP.OR, items: [a, b, c] })
  })

  it('n-ary 摊平抛错', () => {
    const nary = { op: LOGIC_OP.AND, children: [a, b, c] }
    expect(() => flattenSameLogicChain(nary)).toThrow(/恰好 2/)
  })
})
