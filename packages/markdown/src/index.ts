// Package name is literally highlight.js — not a relative .js path.
// eslint-disable-next-line no-restricted-syntax -- highlight.js is the npm package name
import hljs from 'highlight.js'
import { Marked } from 'marked'
import markedFootnote from 'marked-footnote'
import { gfmHeadingId } from 'marked-gfm-heading-id'
import { markedHighlight } from 'marked-highlight'
import markedKatex from 'marked-katex-extension'

export interface TocItem {
  text: string
  level: number
  slug: string
}

const marked = new Marked()
  .use(gfmHeadingId())
  .use(markedFootnote())
  .use(markedKatex({
    throwOnError: false,
    nonStandard: true,
  }))
  .use(markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
      return hljs.highlight(code, { language }).value
    },
  }))

const HEADING_RE = /<h([1-6])[^>]*\sid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/h\1>/gi

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

function extractToc(html: string): TocItem[] {
  const toc: TocItem[] = []
  for (const match of html.matchAll(HEADING_RE)) {
    const level = Number(match[1])
    const slug = match[2]
    const text = stripTags(match[3] ?? '')
    if (!slug || !text)
      continue
    toc.push({ text, level, slug })
  }
  return toc
}

/**
 * 将 Markdown 渲染为 HTML，并提取与标题 id 对齐的目录。
 */
export function renderMarkdown(md: string): { html: string, toc: TocItem[] } {
  const html = marked.parse(md || '', { async: false }) as string
  return {
    html,
    toc: extractToc(html),
  }
}
