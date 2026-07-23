import { AgentErrorBanner } from '@components/copilot/AgentErrorBanner'
import { useEffect, useState } from 'react'
import { EditorChatPanel } from './EditorChatPanel'
import { InlineEditPrompt } from './InlineEditPrompt'
import { useTextEditor } from './useTextEditor'

export function TextEditor() {
  const {
    mountRef,
    polishing,
    suggestions,
    agentError,
    inlineEdit,
    inlinePrompt,
    pendingQuotes,
    acceptAll,
    rejectAll,
    dismissError,
    closeInlinePrompt,
    submitInlinePrompt,
    acceptInline,
    rejectInline,
    removeQuote,
    consumeQuotes,
    getDocument,
    applyProposal,
  } = useTextEditor()

  const [chatBusy, setChatBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inField = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable

      if (!inlineEdit)
        return
      if (inlineEdit.editingInstruction)
        return
      if (inField)
        return
      if (inlineEdit.streaming)
        return
      const key = e.key.toLowerCase()
      if (key === 'y') {
        e.preventDefault()
        acceptInline()
        return
      }
      if (key === 'j') {
        e.preventDefault()
        rejectInline()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inlineEdit, acceptInline, rejectInline])

  const busy = polishing || inlineEdit?.streaming === true || chatBusy
  const blockChat = busy

  return (
    <div className="mx-auto flex h-[calc(100vh-65px)] max-w-7xl flex-col gap-3 p-6">
      <p className="shrink-0 text-sm text-muted-foreground">
        ⌘K 改写选区 · ⌘J 加入对话 · 改稿后在正文审阅红绿预览
      </p>

      {agentError && (
        <AgentErrorBanner error={agentError} onDismiss={dismissError} />
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          {suggestions.length > 0 && (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="text-xs text-sky-800 dark:text-sky-200">
                已生成
                {' '}
                {suggestions.length}
                {' '}
                处修订 · 在正文中审阅红绿预览
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-emerald-600/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-200"
                  disabled={polishing}
                  onClick={() => acceptAll()}
                >
                  全部接受
                </button>
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
                  disabled={polishing}
                  onClick={() => rejectAll()}
                >
                  全部拒绝
                </button>
              </div>
            </div>
          )}
          <div
            ref={mountRef}
            className="min-h-0 flex-1 overflow-auto p-3"
          />
        </div>

        <aside className="flex w-[22rem] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-muted">
          <div className="shrink-0 border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-foreground">写作对话</span>
            <p className="mt-0.5 text-xs text-muted-foreground">⌘J 将选区加入引用</p>
          </div>
          <div className="min-h-0 flex-1">
            <EditorChatPanel
              quotes={pendingQuotes}
              onRemoveQuote={removeQuote}
              onConsumeQuotes={consumeQuotes}
              getDocument={getDocument}
              onApplyProposal={applyProposal}
              onChatBusyChange={setChatBusy}
              blockInput={blockChat}
              blockInputHint="改写进行中，请稍候再发送消息。"
            />
          </div>
        </aside>
      </div>

      {inlinePrompt && (
        <InlineEditPrompt
          anchor={inlinePrompt.anchor}
          initialInstruction={inlinePrompt.initialInstruction}
          onClose={closeInlinePrompt}
          onSubmit={submitInlinePrompt}
        />
      )}
    </div>
  )
}
