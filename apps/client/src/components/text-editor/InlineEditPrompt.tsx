import { useEffect, useRef, useState } from 'react'

export interface InlineEditPromptProps {
  anchor: { top: number, left: number }
  initialInstruction?: string
  onSubmit: (instruction: string) => void
  onClose: () => void
}

export function InlineEditPrompt({
  anchor,
  initialInstruction = '',
  onSubmit,
  onClose,
}: InlineEditPromptProps) {
  const [value, setValue] = useState(initialInstruction)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const top = Math.min(Math.max(8, anchor.top + 8), window.innerHeight - 140)
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - 360)

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-[min(100vw-1rem,22rem)] rounded-xl border border-border bg-card p-3 shadow-2xl"
        style={{ top, left }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-2 text-xs font-medium text-muted-foreground">⌘K 改写选区</div>
        <textarea
          ref={ref}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              const t = value.trim()
              if (t)
                onSubmit(t)
            }
          }}
          rows={3}
          placeholder="描述你想如何修改选中段落…"
          className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            Esc 取消
          </button>
          <button
            type="button"
            disabled={!value.trim()}
            onClick={() => {
              const t = value.trim()
              if (t)
                onSubmit(t)
            }}
            className="rounded border border-emerald-600 bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Enter 生成
          </button>
        </div>
      </div>
    </>
  )
}
