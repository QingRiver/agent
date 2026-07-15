import { describe, expect, it } from 'vitest'
import { chunkMarkdown, hashContent } from './chunker'
import { cleanMarkdown } from './cleaner'

describe('cleaner', () => {
  it('replaces images with kbimg placeholders', () => {
    const result = cleanMarkdown('![logo](./logo.png)\n\n正文', {
      sourceDocId: 'doc1',
    })
    expect(result).toContain('kbimg://doc1/1')
    expect(result).not.toContain('./logo.png')
  })
})

describe('chunker', () => {
  it('按标题分段再用 RecursiveCharacterTextSplitter', async () => {
    const markdown = [
      '# 总则',
      '第一段内容。',
      '## 细则',
      'SKU-9001 专用说明。',
      '工号 E12345 对应审批人。',
    ].join('\n')

    const chunks = await chunkMarkdown(markdown, {
      sourceDocId: 'policy',
      maxChars: 40,
      overlapChars: 10,
    })

    expect(chunks.length).toBeGreaterThan(0)
    const firstChunk = chunks[0]
    expect(firstChunk).toBeDefined()
    expect(firstChunk!.heading_path).toEqual(['总则'])
    expect(chunks.some(chunk => chunk.raw_text.includes('SKU-9001'))).toBe(true)
  })

  it('hashContent is stable', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'))
    expect(hashContent('abc')).not.toBe(hashContent('abd'))
  })

  it('长文本按软边界切开且不孤立 surrogate', async () => {
    const emoji = '🧾'
    const body = Array.from({ length: 40 }, (_, i) => `- [${emoji} 条目${i}](https://example.com/${i})`).join('\n')
    const chunks = await chunkMarkdown(body, {
      sourceDocId: 'emoji-doc',
      maxChars: 80,
      overlapChars: 10,
    })
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.raw_text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
      expect(c.raw_text).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
      if (c.raw_text.includes(emoji[0]!))
        expect(c.raw_text).toContain(emoji)
    }
  })
})
