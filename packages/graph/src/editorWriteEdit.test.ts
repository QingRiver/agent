import { describe, expect, it } from 'vitest'
import { heuristicEditorIntent } from './editorWriteEdit'

describe('heuristicEditorIntent', () => {
  it('detects write verbs', () => {
    expect(heuristicEditorIntent('展开说明市面上已有的主流锂电池种类')).toBe('write')
    expect(heuristicEditorIntent('请润色这段')).toBe('write')
  })

  it('detects ask verbs', () => {
    expect(heuristicEditorIntent('这段什么意思')).toBe('ask')
  })

  it('returns null when unclear', () => {
    expect(heuristicEditorIntent('低空经济')).toBeNull()
  })
})
