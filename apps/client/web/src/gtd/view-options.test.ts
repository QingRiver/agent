import { AVAILABILITY_FILTER, BUILTIN_PERSPECTIVE_ID, FILTER_FIELD } from '@agent/gtd'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GTD_SELECTION,
  parseGtdSelection,
  parseViewOptionsMap,
  patchForAvailability,
  resolveAvailabilityFilter,
  selectPerspective,
  selectProjectFocus,
  selectTagFocus,
  viewOptionsScope,
} from './view-options'

describe('gtd selection', () => {
  it('select helpers', () => {
    expect(selectPerspective(BUILTIN_PERSPECTIVE_ID.INBOX)).toEqual({
      perspectiveId: BUILTIN_PERSPECTIVE_ID.INBOX,
      focus: null,
    })
    expect(selectProjectFocus('p1')).toEqual({
      perspectiveId: BUILTIN_PERSPECTIVE_ID.PROJECTS,
      focus: { field: FILTER_FIELD.PROJECT, id: 'p1' },
    })
    expect(selectTagFocus('t1')).toEqual({
      perspectiveId: BUILTIN_PERSPECTIVE_ID.TAGS,
      focus: { field: FILTER_FIELD.TAG, id: 't1' },
    })
  })

  it('parseGtdSelection：只认新对象', () => {
    expect(parseGtdSelection('"forecast"')).toEqual(DEFAULT_GTD_SELECTION)
    expect(parseGtdSelection(JSON.stringify({ kind: 'project', id: 'p1' }))).toEqual(DEFAULT_GTD_SELECTION)
    expect(parseGtdSelection(JSON.stringify(selectProjectFocus('p1')))).toEqual(selectProjectFocus('p1'))
    expect(parseGtdSelection(JSON.stringify({ perspectiveId: 'custom-uuid', focus: null }))).toEqual({
      perspectiveId: 'custom-uuid',
      focus: null,
    })
  })
})

describe('view options', () => {
  it('viewOptionsScope：一律用 perspectiveId（自定义也有）', () => {
    expect(viewOptionsScope(selectPerspective(BUILTIN_PERSPECTIVE_ID.PROJECTS)))
      .toBe(BUILTIN_PERSPECTIVE_ID.PROJECTS)
    expect(viewOptionsScope(selectProjectFocus('p1'))).toBe(BUILTIN_PERSPECTIVE_ID.PROJECTS)
    expect(viewOptionsScope(selectTagFocus('t1'))).toBe(BUILTIN_PERSPECTIVE_ID.TAGS)
    expect(viewOptionsScope(selectPerspective(BUILTIN_PERSPECTIVE_ID.FORECAST)))
      .toBe(BUILTIN_PERSPECTIVE_ID.FORECAST)
    expect(viewOptionsScope(selectPerspective('custom-uuid'))).toBe('custom-uuid')
  })

  it('resolveAvailabilityFilter：读 overlay 或默认 REMAINING；trash 默认 ALL', () => {
    expect(resolveAvailabilityFilter('custom-uuid', {
      availabilityFilter: AVAILABILITY_FILTER.AVAILABLE,
    })).toBe(AVAILABILITY_FILTER.AVAILABLE)

    expect(resolveAvailabilityFilter(BUILTIN_PERSPECTIVE_ID.PROJECTS, patchForAvailability(AVAILABILITY_FILTER.ALL)))
      .toBe(AVAILABILITY_FILTER.ALL)

    expect(resolveAvailabilityFilter('custom-uuid', undefined))
      .toBe(AVAILABILITY_FILTER.REMAINING)

    expect(resolveAvailabilityFilter(BUILTIN_PERSPECTIVE_ID.TRASH, undefined))
      .toBe(AVAILABILITY_FILTER.ALL)
  })

  it('parse：任意合法透视键均可；非法 availability 丢弃', () => {
    const map = parseViewOptionsMap(JSON.stringify({
      [BUILTIN_PERSPECTIVE_ID.TAGS]: { availabilityFilter: 'remaining' },
      'custom-uuid': { availabilityFilter: 'all' },
      'bad': { availabilityFilter: 'nope' },
    }))
    expect(map.tags).toEqual({ availabilityFilter: AVAILABILITY_FILTER.REMAINING })
    expect(map['custom-uuid']).toEqual({ availabilityFilter: AVAILABILITY_FILTER.ALL })
    expect(map.bad).toBeUndefined()
  })
})
