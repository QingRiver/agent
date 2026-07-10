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
  it('splits markdown by headings and sliding window', () => {
    const markdown = [
      '# 总则',
      '第一段内容。',
      '## 细则',
      'SKU-9001 专用说明。',
      '工号 E12345 对应审批人。',
    ].join('\n')

    const chunks = chunkMarkdown(markdown, {
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
})
