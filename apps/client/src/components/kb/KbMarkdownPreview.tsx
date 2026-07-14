import { marked } from 'marked'
import { useMemo } from 'react'

interface KbMarkdownPreviewProps {
  content: string
  className?: string
}

export function KbMarkdownPreview({ content, className }: KbMarkdownPreviewProps) {
  const html = useMemo(() => {
    try {
      return marked.parse(content || '', { async: false }) as string
    }
    catch {
      return '<p class="text-red-400">预览解析失败</p>'
    }
  }, [content])

  return (
    <div
      className={`prose prose-invert prose-sm max-w-none overflow-auto p-4 text-slate-200 ${className ?? ''}`}
      // 仅渲染本人草稿（可信源）
      // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- intentional preview
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
