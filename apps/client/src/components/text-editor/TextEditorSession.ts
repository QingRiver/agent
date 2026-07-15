import type { Hunk, WriterChangeSummary } from '@agent/protocol'
import type { ViewUpdate } from '@codemirror/view'
import type { AgentErrorInfo } from '@components/copilot/AgentErrorBanner'
import type { Suggestion } from './types'
import { computeHunks, hunkKey, WRITER_CHANGE_SUMMARIES_EVENT } from '@agent/protocol'
import { Conversation } from '@apis/conversation-api'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState, RangeSet, StateEffect, StateField } from '@codemirror/state'
import { EditorView, gutter, GutterMarker } from '@codemirror/view'
import { yCollab } from 'y-codemirror.next'
import * as Y from 'yjs'

const INITIAL_TEXT = `低空经济是2026年非常火热的行业，主要靠无人机。

低空经济指在3000米以下空域内，以无人机、eVTOL（电动垂直起降飞行器）为主角的经济活动。它覆盖物流配送、农林植保、应急救援、城市空中交通等多个场景。

目前行业最大的瓶颈是空域管理。无人机的飞行审批流程繁琐，各地区的规则也不统一，导致跨区域作业很难开展。此外，电池能量密度不足，使得大部分载重无人机的续航都卡在30分钟左右。

未来三年，随着低空空域逐步开放和电池技术进步，城市间的无人机货运网络有望率先跑通。eVTOL 的载客商业化则会更慢一些，预计要到2028年之后才会在少数城市试点。整体来看，低空经济仍处于基础设施建设的早期阶段，机会和风险并存。`

export interface WriterAgent {
  isRunning: boolean
  threadId?: string | null
  setMessages: (messages: unknown[]) => void
  runAgent: (
    input: Record<string, never>,
    options: {
      onEvent: (ctx: {
        event: { type: string, delta?: string, name?: string, value?: unknown }
      }) => void
    },
  ) => Promise<unknown>
}

export interface TextEditorSessionOptions {
  mount: HTMLElement
  getAgent: () => WriterAgent | undefined
  onSuggestionsChange: (suggestions: Suggestion[]) => void
  onPolishingChange: (polishing: boolean) => void
  /** AI 思考流（reasoning_content）变化时回调,供 UI 流式展示 */
  onThinkingChange: (thinking: string) => void
  /** agent 出错时回调（RUN_ERROR 事件或本地异常兜底），供 UI 展示可展开错误条 */
  onAgentError?: (error: AgentErrorInfo) => void
}

/** gutter 圆点 marker,携带该行所有建议的 summary */
class MrDot extends GutterMarker {
  readonly items: { sid: string, summary: string }[]

  constructor(items: { sid: string, summary: string }[]) {
    super()
    this.items = items
  }

  toDOM() {
    const el = document.createElement('div')
    el.className = 'ai-mr-dot'
    el.title = this.items.map(i => i.summary).join('\n')
    return el
  }
}

class MrSpacer extends GutterMarker {
  toDOM() {
    const el = document.createElement('div')
    el.className = 'ai-mr-spacer'
    return el
  }
}

const mrSpacer = new MrSpacer()

/** 建议主键:用 hunkKey,流式中身份稳定 → React 卡片原地更新而非 remount */
function sugSid(h: Hunk): string {
  return hunkKey(h.from, h.originalText)
}

/** 面板相关签名(忽略 from/to 位置变化,只在内容/stale 变化时才推 React) */
function sugSignature(sugs: Suggestion[]): string {
  return sugs.map(s => `${s.sid}|${s.stale ? 1 : 0}|${s.summary}|${s.newText.length}`).join('::')
}

const setSuggestionsEffect = StateEffect.define<Suggestion[]>()
const removeSuggestionEffect = StateEffect.define<string>()

/**
 * 建议状态:CM StateField 持有 Suggestion[](纯位置,不进 Yjs)。
 * - docChanged → tr.changes.mapPos 追位置 + sliceDoc 比对判 stale(CM 原生位置映射,无需 RelativePosition)
 * - setSuggestionsEffect → 整体替换(AI 润色产出)
 * - removeSuggestionEffect → 接受/拒绝单条
 */
const suggestionsField = StateField.define<Suggestion[]>({
  create: () => [],
  update(sugs, tr) {
    // setSuggestionsEffect:整体替换(AI 润色产出,位置已对齐当前 doc),直接返回
    for (const e of tr.effects) {
      if (e.is(setSuggestionsEffect))
        return e.value
      if (e.is(removeSuggestionEffect))
        sugs = sugs.filter(s => s.sid !== e.value)
    }
    if (!tr.docChanged)
      return sugs
    // docChanged(用户编辑 / 接受建议的 changes)→ mapPos 追位置 + sliceDoc 判 stale。
    // 注意:accept 同一 tr 里既有 changes 又有 removeSuggestionEffect,先删后映射,其余建议位置随接受处自动平移。
    return sugs.map((s) => {
      const from = tr.changes.mapPos(s.from, -1)
      const to = tr.changes.mapPos(s.to, 1)
      // 纯插入(originalText='')无区间文本可比,仅靠锚点位置;其余比对区间文本是否被改动
      const stale = s.originalText ? tr.state.sliceDoc(from, to) !== s.originalText : false
      return { ...s, from, to, stale }
    })
  },
})

/** gutter markers:从 suggestionsField 派生,CM 在自身 update 周期重建(无需手动 dispatch) */
const gutterField = StateField.define<RangeSet<MrDot>>({
  create: state => buildGutterSet(state),
  update: (val, tr) => {
    const sugChanged = tr.effects.some(
      e => e.is(setSuggestionsEffect) || e.is(removeSuggestionEffect),
    )
    return tr.docChanged || sugChanged ? buildGutterSet(tr.state) : val
  },
})

function buildGutterSet(state: EditorState): RangeSet<MrDot> {
  const doc = state.doc
  const docLen = doc.length
  const lineItems = new Map<number, { sid: string, summary: string }[]>()
  for (const s of state.field(suggestionsField)) {
    if (s.stale || s.from < 0)
      continue
    const from = Math.min(s.from, docLen)
    const to = Math.min(s.to, docLen)
    if (to < from)
      continue
    const startLine = doc.lineAt(Math.min(from, Math.max(0, docLen))).number
    const endLine = doc.lineAt(
      to > from
        ? Math.min(to - 1, Math.max(0, docLen - 1))
        : Math.min(from, Math.max(0, docLen)),
    ).number
    for (let n = startLine; n <= endLine; n++) {
      const arr = lineItems.get(n) ?? []
      arr.push({ sid: s.sid, summary: s.summary })
      lineItems.set(n, arr)
    }
  }
  const ranges = [...lineItems.entries()].map(([line, items]) =>
    new MrDot(items).range(doc.line(line).from),
  )
  ranges.sort((a, b) => a.from - b.from)
  return RangeSet.of(ranges, true)
}

/**
 * Yjs + CodeMirror 编辑器会话。
 *
 * 正文用 Yjs(yText)+ yCollab 同步(保留协同/undo 能力);修订建议(Suggestion)是纯 CM
 * StateField,位置靠 tr.changes.mapPos 追踪——不进 Yjs、不用 RelativePosition、不挂 yText
 * 观察者,从根上消除「CM update 中 view.dispatch」的重入崩溃。
 */
export class TextEditorSession {
  private disposed = false
  private readonly ydoc = new Y.Doc()
  private readonly yText: Y.Text
  private view: EditorView | null = null
  private threadId: string | null = null
  /** summary 缓存,键为 hunkKey(hintFrom, originalText),与 server 侧 hunk 对齐 */
  private summariesByHunkKey = new Map<string, string>()
  private polishing = false
  /** 本次润色开始时的正文快照;流式 diff 只对此快照有效 */
  private polishBaseline: string | null = null
  /** AI 思考流累积文本（reasoning_content） */
  private thinking = ''
  private readonly options: TextEditorSessionOptions

  constructor(options: TextEditorSessionOptions) {
    this.options = options
    this.yText = this.ydoc.getText('markdown')
  }

  start(): void {
    const mrGutter = gutter({
      class: 'ai-mr-gutter',
      markers: (v: EditorView) => v.state.field(gutterField),
      initialSpacer: () => mrSpacer,
    })

    const editorTheme = EditorView.theme({
      '&': { backgroundColor: 'transparent', color: '#e6edf3' },
      '.cm-content': { caretColor: '#e6edf3', padding: '4px 0' },
      '.cm-gutters': { backgroundColor: 'transparent', color: '#6b7280', border: 'none' },
      '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent' },
      '.cm-selectionBackground, ::selection': { backgroundColor: '#264f78' },
      '&.cm-focused': { outline: 'none' },
      '.ai-mr-gutter': { width: '14px', whiteSpace: 'nowrap' },
      '.ai-mr-spacer': { display: 'inline-block', width: '14px' },
      '.ai-mr-dot': {
        display: 'inline-block',
        width: '8px',
        height: '8px',
        margin: '9px 3px 0',
        borderRadius: '9999px',
        background: '#3b82f6',
        boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.2)',
        cursor: 'help',
        verticalAlign: 'top',
      },
    }, { dark: true })

    this.view = new EditorView({
      state: EditorState.create({
        extensions: [
          EditorView.lineWrapping,
          markdown(),
          yCollab(this.yText, undefined),
          suggestionsField,
          gutterField,
          mrGutter,
          // 只在面板相关签名变化时推 React,避免每次按键重渲染
          EditorView.updateListener.of((v: ViewUpdate) => {
            const before = sugSignature(v.startState.field(suggestionsField))
            const after = sugSignature(v.state.field(suggestionsField))
            if (before !== after)
              this.options.onSuggestionsChange(v.state.field(suggestionsField))
          }),
          editorTheme,
        ],
      }),
      parent: this.options.mount,
    })

    this.yText.insert(0, INITIAL_TEXT)
    this.options.onSuggestionsChange([])
  }

  dispose(): void {
    if (this.disposed)
      return
    this.disposed = true
    this.view?.destroy()
    this.view = null
    this.ydoc.destroy()
  }

  accept(sid: string): void {
    // 不变量:润色中禁止接受,防止写入未完成的 newText(代码层兜底,不依赖 UI disabled)
    if (!this.alive() || this.polishing || !this.view)
      return
    const s = this.view.state.field(suggestionsField).find(x => x.sid === sid)
    if (!s)
      return
    // 锚点区间文本已被改动 → 失效,拒绝写入
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

  async polish(): Promise<void> {
    if (!this.alive() || this.polishing || !this.view)
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
    this.thinking = ''
    this.options.onPolishingChange(true)
    this.options.onThinkingChange('')
    let aiText = ''
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
          if (event.type === 'TEXT_MESSAGE_CONTENT') {
            aiText += event.delta ?? ''
            this.syncSuggestions(original, aiText)
          }
          else if (event.type === 'REASONING_MESSAGE_START') {
            this.thinking = ''
            this.options.onThinkingChange(this.thinking)
          }
          else if (event.type === 'REASONING_MESSAGE_CONTENT') {
            this.thinking += event.delta ?? ''
            this.options.onThinkingChange(this.thinking)
          }
          else if (event.type === 'CUSTOM' && event.name === WRITER_CHANGE_SUMMARIES_EVENT) {
            this.applyAgentSummaries(event.value)
            // summary 到达时流已结束、aiText 为终态,直接做 final 提交(含尾部 hunk)
            this.syncSuggestions(original, aiText, { final: true })
          }
          else if (event.type === 'RUN_ERROR') {
            // RUN_ERROR 扩展字段由后端 serializeAgentError 挂载（ag-ui passthrough 透传）
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
      })
    }
    catch (err) {
      if (this.alive()) {
        console.error('writer agent 失败:', err)
        // 本地异常兜底（非 RUN_ERROR 事件路径，如 runAgent reject）
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
        // 兜底:若 summaryLlm 失败导致 CUSTOM 未到达,这里仍提交尾部 hunk(无 summary)
        if (this.polishBaseline !== null)
          this.syncSuggestions(original, aiText, { final: true })
        this.polishing = false
        this.polishBaseline = null
        this.thinking = ''
        this.options.onPolishingChange(false)
        this.options.onThinkingChange('')
      }
    }
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

  /**
   * 用冻结的 `original` 与累积的 `aiText` 重算 hunk,经 setSuggestionsEffect 写入 CM 状态。
   *
   * - `final=false`(流式中):丢弃按文档顺序的最后一个 hunk(仍在生长的尾部),避免边界
   *   漂移导致卡片抖动;已稳定的 hunk 用 hunkKey 做 sid 原地更新。
   * - `final=true`(流式结束):提交全部 hunk(含尾部),并填入已缓存的 summary。
   *
   * 位置=hunk 在 original 中的偏移;润色中 yText 不变,故等价于当前 CM doc 位置。
   * 若用户在润色中改了正文(doc ≠ original)→ 作废基线、清空建议,避免快照坐标错位。
   */
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
