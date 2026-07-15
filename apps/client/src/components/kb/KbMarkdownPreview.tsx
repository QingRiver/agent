import { renderMarkdown } from '@agent/markdown'
import { useMemo, useRef } from 'react'
import { KbMarkdownToc } from './KbMarkdownToc'

interface KbMarkdownPreviewProps {
  content: string
  className?: string
}

export function KbMarkdownPreview({ content, className }: KbMarkdownPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const { html, toc } = useMemo(() => {
    try {
      return renderMarkdown(content || '')
    }
    catch {
      return {
        html: '<p class="text-red-400">预览解析失败</p>',
        toc: [],
      }
    }
  }, [content])

  const hasToc = toc.length > 0

  return (
    <div className={`flex min-h-0 ${className ?? ''}`}>
      <div
        ref={scrollRef}
        className={`prose prose-invert prose-sm max-w-none min-h-0 flex-1 overflow-auto p-4 text-slate-200 ${hasToc ? 'pr-2' : ''}`}
        // 仅渲染本人草稿（可信源）
        // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- intentional preview
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {hasToc && (
        <KbMarkdownToc
          toc={toc}
          scrollRootRef={scrollRef}
          className="hidden w-40 shrink-0 sm:block lg:w-44"
        />
      )}
    </div>
  )
}
