import type { MarkedExtension, Tokens } from 'marked'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 将 ```mermaid 代码块转为 `<div class="mermaid">` 占位，供 DOM 注入后由 mermaid.run 异步渲染。
 * 非 mermaid 返回 false，交回前一个 renderer（如 marked-highlight）。
 */
export function markedMermaid(): MarkedExtension {
  return {
    renderer: {
      code({ text, lang, escaped }: Tokens.Code) {
        if (lang === 'mermaid') {
          const body = escaped ? text : escapeHtml(text)
          return `<div class="mermaid">${body}</div>\n`
        }
        return false
      },
    },
  }
}
