import { describe, expect, it } from 'vitest'
import { applyDocumentEdits } from './writer'

describe('applyDocumentEdits', () => {
  it('按序唯一替换', () => {
    const baseline = '甲段。\n乙段。\n丙段。'
    const result = applyDocumentEdits(baseline, [
      { search: '乙段。', replace: '乙段改。' },
      { search: '甲段。', replace: '甲段改。' },
    ])
    expect(result).toEqual({ ok: true, polished: '甲段改。\n乙段改。\n丙段。' })
  })

  it('search 找不到则失败', () => {
    const result = applyDocumentEdits('全文', [{ search: '没有', replace: 'x' }])
    expect(result.ok).toBe(false)
  })

  it('search 多次出现则失败', () => {
    const result = applyDocumentEdits('aa aa', [{ search: 'aa', replace: 'b' }])
    expect(result.ok).toBe(false)
  })

  it('空 edits 失败', () => {
    expect(applyDocumentEdits('x', []).ok).toBe(false)
  })

  it('替换后无变化则失败', () => {
    const result = applyDocumentEdits('原文', [{ search: '原文', replace: '原文' }])
    expect(result.ok).toBe(false)
  })
})
