import { AgentErrorBanner } from '@components/copilot/AgentErrorBanner'
import { useEffect, useRef, useState } from 'react'
import { DiffView } from './DiffView'
import { useTextEditor } from './useTextEditor'

export function TextEditor() {
  const {
    mountRef,
    polishing,
    suggestions,
    thinking,
    agentError,
    polish,
    accept,
    reject,
    dismissError,
  } = useTextEditor()
  const [activeSid, setActiveSid] = useState<string | null>(null)
  const activeSuggestion = suggestions.find(s => s.sid === activeSid) ?? null
  const thinkingRef = useRef<HTMLDivElement>(null)

  // Esc 关闭 diff 模态
  useEffect(() => {
    if (!activeSid)
      return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')
        setActiveSid(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeSid])

  // thinking 流式时自动滚到底,确保看到最新内容而非开头
  useEffect(() => {
    const el = thinkingRef.current
    if (el)
      el.scrollTop = el.scrollHeight
  }, [thinking])

  return (
    <div className="mx-auto flex h-[calc(100vh-65px)] max-w-6xl flex-col gap-3 p-6">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-100">AI 修订编辑器 · writer agent</h1>
        <button
          type="button"
          disabled={polishing}
          onClick={polish}
          className="rounded-md border border-emerald-500 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-default disabled:opacity-60"
        >
          {polishing ? 'AI 润色中…' : '让 AI 润色这段话'}
        </button>
      </div>

      {agentError && (
        <AgentErrorBanner error={agentError} onDismiss={dismissError} />
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        <div
          ref={mountRef}
          className="min-w-0 flex-1 overflow-auto rounded-xl border border-slate-800 bg-[#0b1220] p-3"
        />

        <aside className="flex w-80 shrink-0 flex-col overflow-visible rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3">
            <span className="text-sm font-semibold text-slate-200">修订建议</span>
            <span className="text-xs text-slate-500">{suggestions.length}</span>
          </div>

          {/* AI 思考流：润色中实时展示 reasoning_content，替代干瘪的「正在生成」 */}
          {polishing && (
            <div className="shrink-0 border-b border-slate-800 px-4 py-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-sky-300">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-400" />
                AI 思考中
              </div>
              {thinking
                ? (
                    <div
                      ref={thinkingRef}
                      className="dark-scrollbar max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-400"
                    >
                      {thinking}
                      <span className="text-slate-600">▌</span>
                    </div>
                  )
                : <div className="text-xs text-slate-600">正在梳理修改思路…</div>}
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
            {suggestions.length === 0 && !polishing && (
              <p className="px-1 text-sm text-slate-500">点击「让 AI 润色这段话」生成建议</p>
            )}
            {suggestions.map(s => (
              <div
                key={s.sid}
                onClick={() => !s.stale && setActiveSid(s.sid)}
                className={
                  s.stale
                    ? 'rounded-lg border border-slate-700 bg-slate-800/30 p-2 opacity-70'
                    : 'cursor-pointer rounded-lg border border-slate-700 bg-slate-800/40 p-2 transition hover:border-slate-600 hover:bg-slate-800/70'
                }
              >
                <div className="mb-2 flex items-start gap-2">
                  <span
                    className={
                      s.newText && s.originalText
                        ? 'shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-xs text-sky-400'
                        : s.newText
                          ? 'shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-400'
                          : 'shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-xs text-red-400'
                    }
                  >
                    {s.newText && s.originalText ? '改' : s.newText ? '加' : '删'}
                  </span>
                  <span className="line-clamp-1 break-words text-sm text-slate-200" title={s.summary}>
                    {s.summary || (polishing ? '生成修改说明中…' : '修订建议')}
                  </span>
                </div>

                {s.stale
                  ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-amber-400">⚠ 原文已变动</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            reject(s.sid)
                          }}
                          className="rounded border border-red-600 px-2 py-0.5 text-xs text-red-400 transition hover:bg-red-600/20"
                        >
                          ✗ 移除
                        </button>
                      </div>
                    )
                  : (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={polishing}
                          onClick={(e) => {
                            e.stopPropagation()
                            accept(s.sid)
                          }}
                          className="rounded border border-emerald-600 px-2 py-0.5 text-xs text-emerald-400 transition hover:bg-emerald-600/20 disabled:cursor-default disabled:opacity-50"
                        >
                          ✓ 接受
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            reject(s.sid)
                          }}
                          className="rounded border border-red-600 px-2 py-0.5 text-xs text-red-400 transition hover:bg-red-600/20"
                        >
                          ✗ 拒绝
                        </button>
                      </div>
                    )}
              </div>
            ))}
          </div>
        </aside>
      </div>

      <p className="shrink-0 text-sm text-slate-400">
        左侧编辑器行号槽的蓝点 = 该行有 AI merge request。右侧面板逐条
        <span className="text-emerald-400"> ✓ 接受</span>
        {' '}
        /
        <span className="text-red-400"> ✗ 拒绝</span>
        ，点击卡片查看 diff。
      </p>

      {/* 大尺寸 diff 模态页 */}
      {activeSuggestion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setActiveSid(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
              <div className="flex items-center gap-2">
                <span
                  className={
                    activeSuggestion.newText && activeSuggestion.originalText
                      ? 'rounded bg-sky-500/15 px-1.5 py-0.5 text-xs text-sky-400'
                      : activeSuggestion.newText
                        ? 'rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-400'
                        : 'rounded bg-red-500/15 px-1.5 py-0.5 text-xs text-red-400'
                  }
                >
                  {activeSuggestion.newText && activeSuggestion.originalText ? '改' : activeSuggestion.newText ? '加' : '删'}
                </span>
                <span className="break-words text-sm text-slate-200">
                  {activeSuggestion.summary || '修订建议'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveSid(null)}
                className="shrink-0 rounded px-2 py-0.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              <DiffView originalText={activeSuggestion.originalText} newText={activeSuggestion.newText} />
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-800 px-5 py-3">
              <button
                type="button"
                disabled={polishing}
                onClick={() => {
                  accept(activeSuggestion.sid)
                  setActiveSid(null)
                }}
                className="rounded border border-emerald-600 px-3 py-1 text-sm text-emerald-400 transition hover:bg-emerald-600/20 disabled:cursor-default disabled:opacity-50"
              >
                ✓ 接受
              </button>
              <button
                type="button"
                onClick={() => {
                  reject(activeSuggestion.sid)
                  setActiveSid(null)
                }}
                className="rounded border border-red-600 px-3 py-1 text-sm text-red-400 transition hover:bg-red-600/20"
              >
                ✗ 拒绝
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
