import type { EditorQuote } from './editor-quotes'

export type { EditorQuote } from './editor-quotes'

export interface EditorQuoteChipsProps {
  quotes: EditorQuote[]
  onRemove: (id: string) => void
}

export function EditorQuoteChips({ quotes, onRemove }: EditorQuoteChipsProps) {
  if (quotes.length === 0)
    return null

  return (
    <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2">
      {quotes.map(q => (
        <div
          key={q.id}
          className="group flex max-w-full items-start gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs text-sky-800 dark:text-sky-200"
        >
          <span className="line-clamp-2 min-w-0 flex-1 whitespace-pre-wrap break-words">
            {q.text}
          </span>
          <button
            type="button"
            onClick={() => onRemove(q.id)}
            className="shrink-0 rounded px-0.5 text-sky-700/70 hover:bg-sky-500/20 hover:text-sky-900 dark:text-sky-300"
            aria-label="移除引用"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
