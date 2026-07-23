import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './index'

describe('renderMarkdown', () => {
  it('为标题生成 id 且 toc 与 id 对齐', () => {
    const { html, toc } = renderMarkdown('# Hello World\n\n## Nested Title\n')
    expect(html).toMatch(/<h1[^>]*id=["']hello-world["']/)
    expect(html).toMatch(/<h2[^>]*id=["']nested-title["']/)
    expect(toc).toEqual([
      { text: 'Hello World', level: 1, slug: 'hello-world' },
      { text: 'Nested Title', level: 2, slug: 'nested-title' },
    ])
  })

  it('对代码块输出 hljs 高亮标记', () => {
    const { html } = renderMarkdown('```ts\nconst x: number = 1\n```\n')
    expect(html).toContain('hljs')
    expect(html).toContain('language-ts')
  })

  it('将 mermaid 代码块转为 .mermaid 占位且不破坏其他高亮', () => {
    const md = [
      '```mermaid',
      'graph TD;',
      '  A-->B',
      '```',
      '',
      '```ts',
      'const x = 1',
      '```',
      '',
    ].join('\n')
    const { html } = renderMarkdown(md)
    expect(html).toContain('class="mermaid"')
    expect(html).toContain('graph TD;')
    expect(html).not.toMatch(/<pre[^>]*>[\s\S]*graph TD/)
    expect(html).toContain('hljs')
    expect(html).toContain('language-ts')
  })

  it('mermaid 源码中的 HTML 特殊字符被转义（不双重转义）', () => {
    const { html } = renderMarkdown('```mermaid\nA["<script>"]\n```\n')
    expect(html).toContain('class="mermaid"')
    expect(html).toMatch(/&lt;script&gt;/)
    expect(html).not.toContain('&amp;lt;')
    expect(html).not.toContain('<script>')
  })

  it('渲染 GFM 脚注', () => {
    const { html } = renderMarkdown('Note[^1].\n\n[^1]: Footnote body\n')
    expect(html).toMatch(/data-footnote-ref|footnote/)
    expect(html).toContain('Footnote body')
  })

  it('渲染行内与块级 LaTeX', () => {
    const { html } = renderMarkdown('Inline $a^2+b^2=c^2$\n\n$$\nE=mc^2\n$$\n')
    expect(html).toContain('katex')
    expect(html).toMatch(/a\^2|mc\^2|frac|mord/)
  })

  it('空内容返回空 html 与空 toc', () => {
    const { html, toc } = renderMarkdown('')
    expect(html).toBe('')
    expect(toc).toEqual([])
  })
})
