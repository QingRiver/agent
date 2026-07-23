import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { ThemeStore } from '@stores/theme-store'
import { useAtomValue } from 'jotai'
import { useEffect, useRef } from 'react'

function createEditorTheme(isDark: boolean) {
  return EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: 'transparent',
      color: isDark ? '#e6edf3' : '#1f2937',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: '13px',
    },
    '.cm-content': {
      caretColor: isDark ? '#e6edf3' : '#1f2937',
      padding: '12px 0',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: isDark ? '#6b7280' : '#9ca3af',
      border: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
    },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: isDark ? '#264f78' : '#bfdbfe',
    },
    '&.cm-focused': { outline: 'none' },
  }, { dark: isDark })
}

interface KbMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  /** 换文档时由父组件 key=docId remount，本组件只在挂载时读一次初始正文 */
  docId: string
}

export function KbMarkdownEditor({ value, onChange, docId }: KbMarkdownEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const initialDoc = useRef(value).current
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const mode = useAtomValue(ThemeStore.modeAtom)
  const isDark = mode === 'dark'

  useEffect(() => {
    const mount = mountRef.current
    if (!mount)
      return

    const view = new EditorView({
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          EditorView.lineWrapping,
          markdown(),
          createEditorTheme(isDark),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
      parent: mount,
    })

    return () => {
      view.destroy()
    }
  }, [docId, initialDoc, isDark])

  return (
    <div
      ref={mountRef}
      className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/40"
    />
  )
}
