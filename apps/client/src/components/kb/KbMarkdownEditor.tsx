import type { Ref } from 'react'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { ThemeStore } from '@stores/theme-store'
import { useAtomValue } from 'jotai'
import { useEffect, useImperativeHandle, useRef } from 'react'

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

/** 解析 Markdown ATX 标题行正文（避免正则回溯告警） */
function markdownHeadingTitle(line: string): string | null {
  if (!line.startsWith('#'))
    return null
  let i = 0
  while (i < line.length && i < 6 && line[i] === '#')
    i += 1
  if (i === 0)
    return null
  const after = line.slice(i)
  if (!after.startsWith(' ') && !after.startsWith('\t'))
    return null
  const title = after.trim()
  return title.length > 0 ? title : null
}

interface KbMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  /** 换文档时由父组件 key=docId remount，本组件只在挂载时读一次初始正文 */
  docId: string
  ref?: Ref<KbMarkdownEditorHandle>
}

export interface KbMarkdownEditorHandle {
  scrollToHeading: (headingText: string) => void
}

export function KbMarkdownEditor({ value, onChange, docId, ref }: KbMarkdownEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const initialDoc = useRef(value).current
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const mode = useAtomValue(ThemeStore.modeAtom)
  const isDark = mode === 'dark'

  useImperativeHandle(ref, () => ({
    scrollToHeading(headingText: string) {
      const view = viewRef.current
      if (!view)
        return
      const needle = headingText.trim()
      const doc = view.state.doc
      for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i)
        const title = markdownHeadingTitle(line.text)
        if (title === needle) {
          view.dispatch({
            effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
          })
          return
        }
      }
    },
  }))

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
    viewRef.current = view

    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [docId, initialDoc, isDark])

  useEffect(() => {
    const view = viewRef.current
    if (!view)
      return
    const current = view.state.doc.toString()
    if (current === value)
      return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    })
  }, [value])

  return (
    <div
      ref={mountRef}
      className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/40"
    />
  )
}
