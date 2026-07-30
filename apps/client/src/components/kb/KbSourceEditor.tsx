import type { TocItem } from '@agent/markdown'
import type { KbMarkdownEditorHandle } from './KbMarkdownEditor'
import { renderMarkdown } from '@agent/markdown'
import { useRef } from 'react'
import { KbMarkdownEditor } from './KbMarkdownEditor'
import { KbMarkdownToc } from './KbMarkdownToc'

interface KbSourceEditorProps {
  value: string
  onChange: (value: string) => void
  docId: string
}

/** 源码编辑：CodeMirror + 侧栏 TOC */
export function KbSourceEditor({ value, onChange, docId }: KbSourceEditorProps) {
  const editorRef = useRef<KbMarkdownEditorHandle>(null)

  const { toc } = renderMarkdown(value)
  const hasToc = toc.length > 0

  function onNavigateHeading(item: TocItem) {
    editorRef.current?.scrollToHeading(item.text)
  }

  return (
    <div className="flex min-h-0 flex-1 gap-0 overflow-hidden">
      <KbMarkdownEditor
        ref={editorRef}
        key={docId}
        docId={docId}
        value={value}
        onChange={onChange}
      />
      {hasToc && (
        <KbMarkdownToc
          toc={toc}
          onNavigateHeading={onNavigateHeading}
          className="hidden w-40 shrink-0 sm:block lg:w-44"
        />
      )}
    </div>
  )
}
