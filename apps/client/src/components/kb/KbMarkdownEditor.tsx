import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'

const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: '#e6edf3' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '13px' },
  '.cm-content': { caretColor: '#e6edf3', padding: '12px 0' },
  '.cm-gutters': { backgroundColor: 'transparent', color: '#6b7280', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-selectionBackground, ::selection': { backgroundColor: '#264f78' },
  '&.cm-focused': { outline: 'none' },
}, { dark: true })

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
          editorTheme,
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
  }, [docId, initialDoc])

  return (
    <div
      ref={mountRef}
      className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40"
    />
  )
}
