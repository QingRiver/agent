import { describe, expect, it } from 'vitest'
import { FILTER_FIELD } from '../../data/types'
import { entityFocusFilter, mergeFilter } from './merge'
import { LEAF_OP, LOGIC_OP } from './schema'

const flagged = { op: LEAF_OP.IS, field: FILTER_FIELD.FLAGGED, value: true } as const
const projectP1 = { op: LEAF_OP.SOME, field: FILTER_FIELD.PROJECT, value: ['p1'] } as const
const tagT1 = { op: LEAF_OP.SOME, field: FILTER_FIELD.TAG, value: ['t1'] } as const

describe('mergeFilter', () => {
  it('任一侧 null → 另一侧', () => {
    expect(mergeFilter(null, null)).toBeNull()
    expect(mergeFilter(flagged, null)).toEqual(flagged)
    expect(mergeFilter(null, projectP1)).toEqual(projectP1)
  })

  it('双侧叶 → and', () => {
    expect(mergeFilter(flagged, projectP1)).toEqual({
      op: LOGIC_OP.AND,
      children: [flagged, projectP1],
    })
  })

  it('已是 and 则摊平一层', () => {
    const left = { op: LOGIC_OP.AND, children: [flagged, tagT1] }
    expect(mergeFilter(left, projectP1)).toEqual({
      op: LOGIC_OP.AND,
      children: [flagged, tagT1, projectP1],
    })
    expect(mergeFilter(projectP1, left)).toEqual({
      op: LOGIC_OP.AND,
      children: [projectP1, flagged, tagT1],
    })
  })
})

describe('entityFocusFilter', () => {
  it('project / tag → some 叶', () => {
    expect(entityFocusFilter({ field: FILTER_FIELD.PROJECT, id: 'p1' })).toEqual(projectP1)
    expect(entityFocusFilter({ field: FILTER_FIELD.TAG, id: 't1' })).toEqual(tagT1)
  })
})
