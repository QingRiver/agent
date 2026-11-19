import { describe, expect, it } from 'vitest'
import {
  parseWriterCustomEvent,
  parseWriterProposal,
  WRITER_CHANGE_SUMMARIES_EVENT,
} from './writer'

describe('parseWriterProposal', () => {
  const ok = {
    baseline: '原文',
    polished: '改稿',
    changes: [{ hintFrom: 0, originalText: '原文', newText: '改稿', summary: '改' }],
  }

  it('解析成功 tool result', () => {
    expect(parseWriterProposal({ ok: true, ...ok })).toEqual(ok)
  })

  it('解析成功 payload', () => {
    expect(parseWriterProposal(ok)).toEqual(ok)
  })

  it('失败 result → null', () => {
    expect(parseWriterProposal({ ok: false, error: 'x' })).toBeNull()
  })

  it('custom 事件', () => {
    expect(parseWriterCustomEvent({
      name: WRITER_CHANGE_SUMMARIES_EVENT,
      payload: ok,
    })).toEqual(ok)
    expect(parseWriterCustomEvent({ name: 'other', payload: ok })).toBeNull()
  })
})
