import hljs from 'highlight.js/lib/core'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import typescript from 'highlight.js/lib/languages/typescript'
import html from 'highlight.js/lib/languages/xml'
import { Marked } from 'marked'
import markedFootnote from 'marked-footnote'
import { gfmHeadingId } from 'marked-gfm-heading-id'
import { markedHighlight } from 'marked-highlight'
import markedKatex from 'marked-katex-extension'
import { markedMermaid } from './marked-mermaid'

export interface TocItem {
  text: string
  level: number
  slug: string
}

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('html', html)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)

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
      // 原样返回，避免 hljs 转义/改写后污染 mermaid 源码
      if (lang === 'mermaid')
        return code
      if (!lang || !hljs.getLanguage(lang))
        return hljs.highlightAuto(code, []).value
      return hljs.highlight(code, { language: lang }).value
    },
  }))
  // 须在 marked-highlight 之后：非 mermaid 返回 false，回落到 highlight
  .use(markedMermaid())

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
 * 解析失败时返回默认提示，不向外抛错。
 */
export function renderMarkdown(md: string): { html: string, toc: TocItem[] } {
  try {
    const html = marked.parse(md || '', { async: false }) as string
    return {
      html,
      toc: extractToc(html),
    }
  }
  catch {
    return { html: '<p>解析异常</p>', toc: [] }
  }
}
