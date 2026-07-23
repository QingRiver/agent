import type { Hunk, WriterChangeSummary } from '@agent/protocol'
import type { ViewUpdate } from '@codemirror/view'
import type { AgentErrorInfo } from '@components/copilot/AgentErrorBanner'
import type { InlineEditState } from './inline-edit-field'
import type { Suggestion } from './types'
import { computeHunks, hunkKey, WRITER_CHANGE_SUMMARIES_EVENT } from '@agent/protocol'
import { Conversation } from '@apis/conversation-api'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { yCollab } from 'y-codemirror.next'
import * as Y from 'yjs'
import {
  buildInlineUserMessage,
  clearInlineEditEffect,
  inlineEditChangeFilter,
  inlineEditDecorations,
  inlineEditField,
  sanitizeInlineOutput,
  setEditingInstructionEffect,
  setInlineAiTextEffect,
  startInlineEditEffect,
} from './inline-edit-field'
import {
  removeSuggestionEffect,
  setSuggestionsEffect,
  suggestionGhostChangeFilter,
  suggestionGhostDecorations,
  suggestionsField,
} from './suggestion-field'

const INITIAL_TEXT = `低空经济是2026年非常火热的行业，主要靠无人机。

低空经济指在3000米以下空域内，以无人机、eVTOL（电动垂直起降飞行器）为主角的经济活动。它覆盖物流配送、农林植保、应急救援、城市空中交通等多个场景。

目前行业最大的瓶颈是空域管理。无人机的飞行审批流程繁琐，各地区的规则也不统一，导致跨区域作业很难开展。此外，电池能量密度不足，使得大部分载重无人机的续航都卡在30分钟左右。

未来三年，随着低空空域逐步开放和电池技术进步，城市间的无人机货运网络有望率先跑通。eVTOL 的载客商业化则会更慢一些，预计要到2028年之后才会在少数城市试点。整体来看，低空经济仍处于基础设施建设的早期阶段，机会和风险并存。`

export interface WriterAgent {
  isRunning: boolean
  threadId?: string | null
  state?: Record<string, unknown> | null
  setState?: (state: Record<string, unknown>) => void
  setMessages: (messages: unknown[]) => void
  runAgent: (
    input: Record<string, never>,
    options: {
      onEvent?: (ctx: {
        event: { type: string, delta?: string, name?: string, value?: unknown }
      }) => void
      onCustomEvent?: (ctx: {
        event: { type?: string, name?: string, value?: unknown }
      }) => void
    },
  ) => Promise<unknown>
}

export interface SelectionRange {
  from: number
  to: number
  text: string
}

export interface TextEditorSessionOptions {
  mount: HTMLElement
  getAgent: () => WriterAgent | undefined
  onSuggestionsChange: (suggestions: Suggestion[]) => void
  onPolishingChange: (polishing: boolean) => void
  onAgentError?: (error: AgentErrorInfo) => void
  onSelectionAction?: (action: 'edit' | 'chat', range: SelectionRange) => void
  onInlineEditChange?: (edit: InlineEditState | null) => void
}

function sugSid(h: Hunk): string {
  return hunkKey(h.from, h.originalText)
}

function sugSignature(sugs: Suggestion[]): string {
  return sugs.map(s => `${s.sid}|${s.stale ? 1 : 0}|${s.summary}|${s.newText.length}`).join('::')
}

/**
 * Yjs + CodeMirror 编辑器会话。
 * 正文用 Yjs；Suggestion / inline 幽灵预览为纯 CM StateField。
 */
export class TextEditorSession {
  private disposed = false
  private readonly ydoc = new Y.Doc()
  private readonly yText: Y.Text
  private view: EditorView | null = null
  private threadId: string | null = null
  private summariesByHunkKey = new Map<string, string>()
  private polishing = false
  private polishBaseline: string | null = null
  private inlineGen = 0
  private inlineAbort = false
  private readonly options: TextEditorSessionOptions

  constructor(options: TextEditorSessionOptions) {
    this.options = options
    this.yText = this.ydoc.getText('markdown')
  }

  start(): void {
    const isDark = document.documentElement.classList.contains('dark')
    const editorTheme = EditorView.theme({
      '&': {
        backgroundColor: 'transparent',
        color: isDark ? '#e6edf3' : '#1f2937',
      },
      '.cm-content': {
        caretColor: isDark ? '#e6edf3' : '#1f2937',
        padding: '4px 0',
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
      '.cm-inline-edit-old': {
        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.18)' : 'rgba(254, 226, 226, 0.9)',
        color: isDark ? '#fca5a5' : '#b91c1c',
        textDecoration: 'line-through',
      },
      '.cm-inline-edit-preview': {
        margin: '6px 0 10px',
        borderRadius: '8px',
        overflow: 'hidden',
        border: isDark ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(16,185,129,0.4)',
        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(236, 253, 245, 0.95)',
      },
      '.cm-inline-edit-meta': {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        fontSize: '11px',
        color: isDark ? '#94a3b8' : '#64748b',
        borderBottom: isDark ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(16,185,129,0.25)',
      },
      '.cm-inline-edit-meta-label': {
        flexShrink: '0',
      },
      '.cm-inline-edit-instruction-input': {
        flex: '1',
        minWidth: '0',
        fontSize: '11px',
        lineHeight: '1.4',
        padding: '2px 6px',
        borderRadius: '4px',
        border: isDark ? '1px solid #475569' : '1px solid #cbd5e1',
        background: isDark ? 'rgba(0,0,0,0.35)' : '#fff',
        color: isDark ? '#e2e8f0' : '#0f172a',
        outline: 'none',
      },
      '.cm-inline-edit-instruction-input:focus': {
        borderColor: '#10b981',
        boxShadow: '0 0 0 1px rgba(16,185,129,0.35)',
      },
      '.cm-inline-edit-ghost': {
        padding: '8px 10px',
        whiteSpace: 'pre-wrap',
        color: isDark ? '#6ee7b7' : '#047857',
        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(209, 250, 229, 0.85)',
        fontSize: 'inherit',
        lineHeight: 'inherit',
      },
      '.cm-inline-edit-toolbar': {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        padding: '6px 8px',
        borderTop: isDark ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(16,185,129,0.25)',
        backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)',
      },
      '.cm-inline-edit-btn': {
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '4px',
        border: isDark ? '1px solid #475569' : '1px solid #cbd5e1',
        background: 'transparent',
        color: isDark ? '#e2e8f0' : '#334155',
        cursor: 'pointer',
      },
      '.cm-inline-edit-btn:hover': {
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
      },
      '.cm-inline-edit-btn:disabled': {
        opacity: '0.45',
        cursor: 'not-allowed',
      },
      '.cm-inline-edit-btn-accept': {
        borderColor: '#059669',
        color: isDark ? '#6ee7b7' : '#047857',
      },
      '.cm-inline-edit-btn-reject': {
        borderColor: '#dc2626',
        color: isDark ? '#fca5a5' : '#b91c1c',
      },
      '.cm-inline-edit-btn-stop': {
        borderColor: '#d97706',
        color: isDark ? '#fcd34d' : '#b45309',
      },
    }, { dark: isDark })

    const selectionKeymap = Prec.highest(keymap.of([
      {
        key: 'Mod-k',
        run: (view) => {
          const { from, to } = view.state.selection.main
          if (from === to)
            return false
          if (view.state.field(suggestionsField).length > 0) {
            this.options.onAgentError?.({
              message: '请先处理正文中的修订预览，或全部拒绝后再使用 ⌘K',
              code: 'EDITOR_BUSY',
              name: 'Busy',
              json: '{}',
            })
            return true
          }
          this.options.onSelectionAction?.('edit', {
            from,
            to,
            text: view.state.sliceDoc(from, to),
          })
          return true
        },
      },
      {
        key: 'Mod-j',
        run: (view) => {
          const { from, to } = view.state.selection.main
          if (from === to)
            return false
          this.options.onSelectionAction?.('chat', {
            from,
            to,
            text: view.state.sliceDoc(from, to),
          })
          return true
        },
      },
    ]))

    this.view = new EditorView({
      state: EditorState.create({
        extensions: [
          EditorView.lineWrapping,
          markdown(),
          yCollab(this.yText, undefined),
          suggestionsField,
          suggestionGhostDecorations,
          suggestionGhostChangeFilter(),
          inlineEditField,
          inlineEditDecorations,
          inlineEditChangeFilter(),
          selectionKeymap,
          EditorView.updateListener.of((v: ViewUpdate) => {
            const before = sugSignature(v.startState.field(suggestionsField))
            const after = sugSignature(v.state.field(suggestionsField))
            if (before !== after)
              this.options.onSuggestionsChange(v.state.field(suggestionsField))

            const ieBefore = v.startState.field(inlineEditField)
            const ieAfter = v.state.field(inlineEditField)
            if (ieBefore !== ieAfter)
              this.options.onInlineEditChange?.(ieAfter)
          }),
          editorTheme,
        ],
      }),
      parent: this.options.mount,
    })

    this.yText.insert(0, INITIAL_TEXT)
    this.options.onSuggestionsChange([])
    this.options.onInlineEditChange?.(null)
  }

  dispose(): void {
    if (this.disposed)
      return
    this.disposed = true
    this.inlineAbort = true
    this.view?.destroy()
    this.view = null
    this.ydoc.destroy()
  }

  getInlineEdit(): InlineEditState | null {
    return this.view?.state.field(inlineEditField) ?? null
  }

  coordsAtPos(pos: number): { top: number, left: number, bottom: number } | null {
    if (!this.view)
      return null
    const c = this.view.coordsAtPos(pos)
    if (!c)
      return null
    return { top: c.top, left: c.left, bottom: c.bottom }
  }

  accept(sid: string): void {
    if (!this.alive() || this.polishing || !this.view)
      return
    const s = this.view.state.field(suggestionsField).find(x => x.sid === sid)
    if (!s || s.stale)
      return
    if (s.originalText && this.view.state.sliceDoc(s.from, s.to) !== s.originalText)
      return
    this.view.dispatch({
      changes: { from: s.from, to: s.to, insert: s.newText },
      effects: removeSuggestionEffect.of(sid),
    })
  }

  reject(sid: string): void {
    if (!this.alive() || !this.view)
      return
    this.view.dispatch({ effects: removeSuggestionEffect.of(sid) })
  }

  /** 自后向前接受，降低位置漂移风险 */
  acceptAll(): void {
    if (!this.alive() || this.polishing || !this.view)
      return
    const sugs = [...this.view.state.field(suggestionsField)]
      .filter(s => !s.stale)
      .sort((a, b) => b.from - a.from)
    for (const s of sugs)
      this.accept(s.sid)
  }

  rejectAll(): void {
    if (!this.alive() || !this.view)
      return
    this.clearSuggestions()
  }

  stopInline(): void {
    this.inlineAbort = true
    if (!this.view)
      return
    const edit = this.view.state.field(inlineEditField)
    if (edit?.streaming) {
      this.view.dispatch({
        effects: setInlineAiTextEffect.of({ aiText: edit.aiText, streaming: false }),
      })
    }
  }

  rejectInline(): void {
    this.inlineAbort = true
    if (!this.alive() || !this.view)
      return
    this.view.dispatch({ effects: clearInlineEditEffect.of(null) })
  }

  beginFollowUpEdit(): void {
    if (!this.alive() || !this.view)
      return
    const edit = this.view.state.field(inlineEditField)
    if (!edit || edit.streaming)
      return
    this.view.dispatch({ effects: setEditingInstructionEffect.of(true) })
  }

  cancelFollowUpEdit(): void {
    if (!this.alive() || !this.view)
      return
    const edit = this.view.state.field(inlineEditField)
    if (!edit?.editingInstruction)
      return
    this.view.dispatch({ effects: setEditingInstructionEffect.of(false) })
  }

  acceptInline(): void {
    if (!this.alive() || !this.view)
      return
    const edit = this.view.state.field(inlineEditField)
    if (!edit || edit.streaming || edit.editingInstruction)
      return
    const text = sanitizeInlineOutput(edit.aiText)
    if (!text)
      return
    if (this.view.state.sliceDoc(edit.from, edit.to) !== edit.originalText)
      return
    const { from, to } = edit
    // 先清幽灵预览解除 changeFilter 锁定，再一次性写入正文（经 yCollab）
    this.view.dispatch({ effects: clearInlineEditEffect.of(null) })
    this.view.dispatch({
      changes: { from, to, insert: text },
    })
  }

  async inlineEdit(params: {
    from: number
    to: number
    text: string
    instruction: string
  }): Promise<void> {
    if (!this.alive() || this.polishing || !this.view)
      return
    if (this.view.state.field(suggestionsField).length > 0) {
      this.options.onAgentError?.({
        message: '请先处理正文中的修订预览，或全部拒绝后再使用 ⌘K',
        code: 'EDITOR_BUSY',
        name: 'Busy',
        json: '{}',
      })
      return
    }
    const ag = this.options.getAgent()
    if (!ag || ag.isRunning)
      return
    if (this.view.state.sliceDoc(params.from, params.to) !== params.text)
      return

    const instruction = params.instruction.trim()
    if (!instruction)
      return

    this.inlineAbort = false
    const gen = ++this.inlineGen
    const doc = this.view.state.doc
    const userContent = buildInlineUserMessage({
      instruction,
      docBefore: doc.sliceString(0, params.from),
      selectedText: params.text,
      docAfter: doc.sliceString(params.to),
    })

    this.view.dispatch({
      effects: startInlineEditEffect.of({
        from: params.from,
        to: params.to,
        originalText: params.text,
        instruction,
        aiText: '',
        streaming: true,
      }),
    })

    this.setEditCase(ag, 'inline', {
      polishInstruction: instruction,
      focuses: [{ from: params.from, to: params.to, text: params.text }],
    })
    ag.setMessages([{ id: `writer-inline-${Date.now()}`, role: 'user', content: userContent }] as never[])
    let aiText = ''
    try {
      if (!this.threadId)
        this.threadId = (await Conversation.create('writer')).id
      if (!this.alive() || gen !== this.inlineGen)
        return
      ag.threadId = this.threadId
      await ag.runAgent({}, {
        onEvent: ({ event }) => {
          if (!this.alive() || gen !== this.inlineGen || this.inlineAbort)
            return
          if (event.type === 'TEXT_MESSAGE_CONTENT') {
            aiText += event.delta ?? ''
            this.view?.dispatch({
              effects: setInlineAiTextEffect.of({
                aiText: sanitizeInlineOutput(aiText) || aiText,
                streaming: true,
              }),
            })
          }
          else if (event.type === 'RUN_ERROR') {
            const ev = event as unknown as Record<string, unknown>
            const str = (k: string): string => {
              const v = ev[k]
              return typeof v === 'string' ? v : ''
            }
            this.options.onAgentError?.({
              message: str('message') || '选区改写失败',
              code: str('code'),
              name: str('name'),
              json: str('json'),
            })
          }
        },
      })
    }
    catch (err) {
      if (this.alive() && gen === this.inlineGen) {
        console.error('writer inline 失败:', err)
        const message = err instanceof Error ? err.message : String(err)
        this.options.onAgentError?.({
          message,
          code: 'AGENT_LOCAL',
          name: err instanceof Error ? err.name : 'Error',
          json: JSON.stringify({}, null, 2),
        })
      }
    }
    finally {
      if (this.alive() && gen === this.inlineGen && this.view) {
        const finalText = sanitizeInlineOutput(aiText)
        this.view.dispatch({
          effects: setInlineAiTextEffect.of({
            aiText: finalText || aiText,
            streaming: false,
          }),
        })
      }
      this.setEditCase(ag, 'document')
    }
  }

  /** 将对话 write 提案应用到多段幽灵 Suggestions（不改正文直至用户 accept） */
  applyProposal(params: {
    baseline: string
    polished: string
    changes?: WriterChangeSummary[]
  }): boolean {
    if (!this.alive() || !this.view)
      return false
    if (this.view.state.field(inlineEditField)) {
      this.options.onAgentError?.({
        message: '请先结束行内改写，再应用对话中的修改',
        code: 'EDITOR_BUSY',
        name: 'Busy',
        json: '{}',
      })
      return false
    }
    const current = this.view.state.doc.toString()
    if (current !== params.baseline) {
      this.options.onAgentError?.({
        message: '文稿已变更，无法应用此次修改建议',
        code: 'BASELINE_STALE',
        name: 'Stale',
        json: '{}',
      })
      return false
    }
    const polished = params.polished.trim()
    if (!polished)
      return false

    this.clearSuggestions()
    this.summariesByHunkKey.clear()
    if (params.changes?.length)
      this.applyAgentSummaries({ changes: params.changes })
    this.syncSuggestions(params.baseline, polished, { final: true })
    return true
  }

  getDocText(): string {
    return this.view?.state.doc.toString() ?? ''
  }

  async polish(): Promise<void> {
    if (!this.alive() || this.polishing || !this.view)
      return
    if (this.view.state.field(inlineEditField))
      return
    const ag = this.options.getAgent()
    if (!ag || ag.isRunning)
      return
    const original = this.view.state.doc.toString()
    if (!original.trim())
      return

    this.clearSuggestions()
    this.summariesByHunkKey.clear()
    this.polishBaseline = original
    this.polishing = true
    this.options.onPolishingChange(true)
    let aiText = ''
    let polishedFromCustom = ''
    this.setEditCase(ag, 'document', { documentBaseline: original })
    ag.setMessages([{ id: `writer-user-${Date.now()}`, role: 'user', content: original }] as never[])
    try {
      if (!this.threadId)
        this.threadId = (await Conversation.create('writer')).id
      if (!this.alive())
        return
      ag.threadId = this.threadId
      await ag.runAgent({}, {
        onEvent: ({ event }) => {
          if (!this.alive() || this.polishBaseline === null)
            return
          if (event.type === 'CUSTOM' && event.name === WRITER_CHANGE_SUMMARIES_EVENT) {
            const value = event.value as {
              changes?: WriterChangeSummary[]
              polished?: string
            } | null
            this.applyAgentSummaries(value)
            if (typeof value?.polished === 'string' && value.polished.trim()) {
              polishedFromCustom = value.polished
              this.syncSuggestions(original, polishedFromCustom, { final: true })
            }
          }
          else if (event.type === 'TEXT_MESSAGE_CONTENT') {
            // document 案助手气泡为短说明；改稿在 CUSTOM.polished
            aiText += event.delta ?? ''
          }
          else if (event.type === 'RUN_ERROR') {
            const ev = event as unknown as Record<string, unknown>
            const str = (k: string): string => {
              const v = ev[k]
              return typeof v === 'string' ? v : ''
            }
            this.options.onAgentError?.({
              message: str('message') || '润色失败',
              code: str('code'),
              name: str('name'),
              json: str('json'),
            })
          }
        },
        onCustomEvent: ({ event }) => {
          if (!this.alive() || this.polishBaseline === null)
            return
          if (event.name !== WRITER_CHANGE_SUMMARIES_EVENT)
            return
          const value = event.value as {
            changes?: WriterChangeSummary[]
            polished?: string
          } | null
          this.applyAgentSummaries(value)
          if (typeof value?.polished === 'string' && value.polished.trim()) {
            polishedFromCustom = value.polished
            this.syncSuggestions(original, polishedFromCustom, { final: true })
          }
        },
      })
    }
    catch (err) {
      if (this.alive()) {
        console.error('writer agent 失败:', err)
        const message = err instanceof Error ? err.message : String(err)
        const detail: Record<string, string> = {}
        if (err instanceof Error && err.stack)
          detail.stack = err.stack
        this.options.onAgentError?.({
          message,
          code: 'AGENT_LOCAL',
          name: err instanceof Error ? err.name : 'Error',
          json: JSON.stringify(detail, null, 2),
        })
      }
    }
    finally {
      if (this.alive()) {
        const finalPolished = polishedFromCustom || aiText
        if (this.polishBaseline !== null && finalPolished.trim())
          this.syncSuggestions(original, finalPolished, { final: true })
        this.polishing = false
        this.polishBaseline = null
        this.options.onPolishingChange(false)
      }
    }
  }

  private setEditCase(
    ag: WriterAgent,
    editCase: 'inline' | 'document',
    extra?: Record<string, unknown>,
  ): void {
    const prev = ag.state != null && typeof ag.state === 'object' ? ag.state : {}
    const next = {
      ...prev,
      editCase,
      writerMode: editCase === 'inline' ? 'inline' : 'polish',
      ...extra,
    }
    const withSetState = ag as WriterAgent & { setState?: (s: Record<string, unknown>) => void }
    if (typeof withSetState.setState === 'function')
      withSetState.setState(next)
    else
      ag.state = next
  }

  private alive(): boolean {
    return !this.disposed
  }

  private clearSuggestions(): void {
    this.view?.dispatch({ effects: setSuggestionsEffect.of([]) })
  }

  private applyAgentSummaries(value: unknown): void {
    const changes = (value as { changes?: WriterChangeSummary[] } | null)?.changes
    if (!changes?.length)
      return
    for (const c of changes) {
      if (c.summary.trim())
        this.summariesByHunkKey.set(hunkKey(c.hintFrom, c.originalText), c.summary.trim())
    }
  }

  private lookupSummary(hintFrom: number, originalText: string): string {
    return this.summariesByHunkKey.get(hunkKey(hintFrom, originalText)) ?? ''
  }

  private syncSuggestions(original: string, aiText: string, opts?: { final?: boolean }): void {
    if (!this.alive() || !this.view)
      return
    if (this.view.state.doc.toString() !== original) {
      if (this.polishBaseline !== null) {
        this.polishBaseline = null
        this.clearSuggestions()
      }
      return
    }
    const hunks = computeHunks(original, aiText).filter(h => h.originalText || h.newText)
    if (!opts?.final && hunks.length > 0)
      hunks.pop()
    const sugs: Suggestion[] = hunks.map(h => ({
      sid: sugSid(h),
      summary: this.lookupSummary(h.from, h.originalText),
      originalText: h.originalText,
      newText: h.newText,
      from: h.from,
      to: h.from + h.originalText.length,
      stale: false,
    }))
    this.view.dispatch({ effects: setSuggestionsEffect.of(sugs) })
  }
}
