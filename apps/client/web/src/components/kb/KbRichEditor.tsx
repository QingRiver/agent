import { renderMarkdown } from '@agent/markdown'
import { useLatest } from '@hooks/useLatest'
import { ThemeStore } from '@stores/theme-store'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useAtomValue } from 'jotai'
import { useEffect, useRef } from 'react'
import { Markdown } from 'tiptap-markdown'
import { KbMarkdownToc } from './KbMarkdownToc'

interface KbRichEditorProps {
  value: string
  onChange: (value: string) => void
  docId: string
}

export function KbRichEditor({ value, onChange, docId }: KbRichEditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useLatest(onChange)
  const skipNextExternalRef = useRef(false)
  const mode = useAtomValue(ThemeStore.modeAtom)
  const isDark = mode === 'dark'

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none min-h-full p-4 outline-none ${isDark ? 'prose-invert' : ''}`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const storage = ed.storage as { markdown?: { getMarkdown: () => string } }
      const md = storage.markdown?.getMarkdown?.() ?? ed.getText()
      skipNextExternalRef.current = true
      onChangeRef.current(md)
    },
  }, [docId, isDark])

  useEffect(() => {
    if (!editor)
      return
    if (skipNextExternalRef.current) {
      skipNextExternalRef.current = false
      return
    }
    const storage = editor.storage as { markdown?: { getMarkdown: () => string } }
    const current = storage.markdown?.getMarkdown?.() ?? ''
    if (current === value)
      return
    editor.commands.setContent(value)
  }, [editor, value])

  const { toc } = renderMarkdown(value)
  const hasToc = toc.length > 0

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-background">
      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 overflow-auto ${hasToc ? 'pr-2' : ''}`}
      >
        <EditorContent editor={editor} />
      </div>
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
