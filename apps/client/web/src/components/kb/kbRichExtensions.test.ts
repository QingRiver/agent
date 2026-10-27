// @vitest-environment happy-dom
import { Editor } from '@tiptap/react'
import { describe, expect, it } from 'vitest'
import { createKbRichExtensions } from './kbRichExtensions'

const SOURCE = [
  '从 [MDN 的文档](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/typeof)可以知道能够直接区分的类型',
  '',
  '| 类型         | 结果        |',
  '| ------------ | ----------- |',
  '| Undefined    | "undefined" |',
  '| Null         | "object"    |',
  '| Boolean      | "boolean"   |',
  '| Number       | "number"    |',
  '| BigInt       | "bigint"    |',
  '| String       | "string"    |',
  '| Symbol       | "symbol"    |',
  '| Function     | "function"  |',
  '| 其他任何对象 | "object"    |',
].join('\n')

describe('createKbRichExtensions', () => {
  it('往返 GFM 表格时保留行列，而不是把单元格拼成一行', () => {
    const editor = new Editor({
      extensions: createKbRichExtensions(),
      content: SOURCE,
    })
    const storage = editor.storage as { markdown?: { getMarkdown: () => string } }
    const out = storage.markdown?.getMarkdown() ?? ''
    editor.destroy()

    expect(out).toContain('[MDN 的文档](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/typeof)')
    expect(out).toMatch(/\| 类型\s+\| 结果\s+\|/)
    expect(out).toMatch(/\| Undefined\s+\| "undefined"\s+\|/)
    expect(out).toMatch(/\| 其他任何对象\s+\| "object"\s+\|/)
    expect(out).not.toContain('类型结果')
  })
})
