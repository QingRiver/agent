import { renderMarkdown } from '@agent/markdown'
import { ThemeStore } from '@stores/theme-store'
import { useAtomValue } from 'jotai'
import mermaid from 'mermaid'
import { useEffect, useMemo, useRef } from 'react'
import { KbMarkdownToc } from './KbMarkdownToc'

interface KbMarkdownPreviewProps {
  content: string
  className?: string
}

function configureMermaid(isDark: boolean): void {
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    securityLevel: 'strict',
  })
}

export function KbMarkdownPreview({ content, className }: KbMarkdownPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const mode = useAtomValue(ThemeStore.modeAtom)
  const isDark = mode === 'dark'

  const { html, toc } = useMemo(() => {
    try {
      return renderMarkdown(content || '')
    }
    catch {
      return {
        html: '<p class="text-destructive">预览解析失败</p>',
        toc: [],
      }
    }
  }, [content])

  useEffect(() => {
    const root = scrollRef.current
    if (!root)
      return

    const nodes = root.querySelectorAll<HTMLElement>('.mermaid')
    if (nodes.length === 0)
      return

    configureMermaid(isDark)
    for (const node of nodes)
      node.removeAttribute('data-processed')

    void mermaid.run({ nodes }).catch((error: unknown) => {
      console.error('Mermaid 渲染失败:', error)
    })
  }, [html, isDark])

  const hasToc = toc.length > 0

  return (
    <div className={`flex min-h-0 ${className ?? ''}`}>
      <div
        ref={scrollRef}
        className={`prose prose-sm max-w-none min-h-0 flex-1 overflow-auto p-4 text-foreground ${isDark ? 'prose-invert' : ''} ${hasToc ? 'pr-2' : ''}`}
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
