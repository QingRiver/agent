import type { WriterChangeSummary } from '@agent/proto'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import {
  parseWriterProposal,
  PROPOSE_DOCUMENT_EDITS_TOOL_NAME,
  ProposeDocumentEditsResultSchema,
} from '@agent/proto'
import { changeSid, useDocumentEditActions } from './documentEditActions'

function parseRaw(result: unknown): unknown {
  if (typeof result !== 'string')
    return result
  try {
    return JSON.parse(result) as unknown
  }
  catch {
    return result
  }
}

function HunkRow({
  change,
  pending,
  onAccept,
  onReject,
}: {
  change: WriterChangeSummary
  pending: boolean
  onAccept: () => void
  onReject: () => void
}) {
  const sid = changeSid(change)
  return (
    <div className="border-t border-border px-2 py-2 first:border-t-0">
      {change.summary
        ? <p className="mb-1 text-[11px] text-muted-foreground">{change.summary}</p>
        : null}
      {change.originalText
        ? (
            <pre className="mb-1 whitespace-pre-wrap text-[11px] text-red-700/90 line-through dark:text-red-400/90">
              {change.originalText}
            </pre>
          )
        : null}
      {change.newText
        ? (
            <pre className="whitespace-pre-wrap text-[11px] text-emerald-700 dark:text-emerald-400">
              {change.newText}
            </pre>
          )
        : null}
      <div className="mt-1.5 flex items-center gap-2">
        {pending
          ? (
              <>
                <button
                  type="button"
                  className="rounded border border-border px-1.5 py-0.5 text-[11px] text-foreground hover:bg-muted"
                  onClick={onAccept}
                >
                  接受
                </button>
                <button
                  type="button"
                  className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                  onClick={onReject}
                >
                  拒绝
                </button>
              </>
            )
          : (
              <span className="text-[11px] text-muted-foreground">已处理</span>
            )}
        <span className="sr-only">{sid}</span>
      </div>
    </div>
  )
}

/** 后端 `propose_document_edits`：Cursor 式 diff 卡，审阅命令走 DocumentEditActions。 */
export function DocumentEditDiffToolRender({
  result,
  status,
}: ToolCallMessagePartProps<Record<string, unknown>>) {
  const actions = useDocumentEditActions()
  const raw = parseRaw(result)
  const parsed = parseWriterProposal(raw)
  const failParsed = ProposeDocumentEditsResultSchema.safeParse(raw)
  const failError = failParsed.success && !failParsed.data.ok ? failParsed.data.error : null

  if (status.type === 'running' || (parsed == null && failError == null && status.type !== 'incomplete')) {
    return (
      <div className="mb-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        正在生成修订…
      </div>
    )
  }

  if (parsed == null) {
    return (
      <div className="mb-2 rounded-md border border-destructive/40 bg-background px-3 py-2 text-xs text-destructive">
        {failError ?? '修订未能完成'}
      </div>
    )
  }

  const pendingSids = actions?.pendingSids
  const anyPending = parsed.changes.some((c) => {
    const sid = changeSid(c)
    return pendingSids == null || pendingSids.has(sid)
  })

  return (
    <div className="mb-2 overflow-hidden rounded-md border border-border bg-background text-xs">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <span className="font-medium text-foreground">
          文档修订 ·
          {parsed.changes.length}
          {' '}
          处
        </span>
        {actions && anyPending
          ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-muted"
                  onClick={() => actions.acceptAll()}
                >
                  全部接受
                </button>
                <button
                  type="button"
                  className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                  onClick={() => actions.rejectAll()}
                >
                  全部拒绝
                </button>
              </div>
            )
          : null}
      </div>
      <div className="max-h-80 overflow-auto">
        {parsed.changes.map((change) => {
          const sid = changeSid(change)
          const pending = pendingSids == null || pendingSids.has(sid)
          return (
            <HunkRow
              key={sid}
              change={change}
              pending={pending}
              onAccept={() => actions?.accept(sid)}
              onReject={() => actions?.reject(sid)}
            />
          )
        })}
      </div>
    </div>
  )
}

export { PROPOSE_DOCUMENT_EDITS_TOOL_NAME }
