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

  it('跳级标题（如直接 ###）不产生 null / 稀疏 path', async () => {
    const markdown = [
      '### 戚风蛋糕',
      '蛋白分次加入。',
      '## 烘焙',
      '烤箱预热。',
    ].join('\n')

    const chunks = await chunkMarkdown(markdown, {
      sourceDocId: 'cake',
      maxChars: 800,
      overlapChars: 0,
    })

    for (const c of chunks) {
      expect(c.heading_path.every(s => typeof s === 'string' && s.length > 0)).toBe(true)
      expect(JSON.stringify(c.heading_path)).not.toContain('null')
    }
    const chiffon = chunks.find(c => c.raw_text.includes('蛋白'))
    expect(chiffon?.heading_path).toEqual(['戚风蛋糕'])
    const bake = chunks.find(c => c.raw_text.includes('烤箱'))
    expect(bake?.heading_path).toEqual(['烘焙'])
  })

  it('h1 后跳到 h3：中间跳级不留洞，降回 h2 路径正确', async () => {
    const markdown = [
      '# 食谱',
      '前言。',
      '### 戚风蛋糕',
      '步骤一。',
      '## 吐司',
      '步骤二。',
    ].join('\n')

    const chunks = await chunkMarkdown(markdown, {
      sourceDocId: 'recipes',
      maxChars: 800,
      overlapChars: 0,
    })

    expect(chunks.find(c => c.raw_text.includes('前言'))?.heading_path).toEqual(['食谱'])
    expect(chunks.find(c => c.raw_text.includes('步骤一'))?.heading_path).toEqual(['食谱', '戚风蛋糕'])
    expect(chunks.find(c => c.raw_text.includes('步骤二'))?.heading_path).toEqual(['食谱', '吐司'])
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
