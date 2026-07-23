import type { Transaction } from '@codemirror/state'
import type { Suggestion } from './types'
import { EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'

export const setSuggestionsEffect = StateEffect.define<Suggestion[]>()
export const removeSuggestionEffect = StateEffect.define<string>()

export const suggestionsField = StateField.define<Suggestion[]>({
  create: () => [],
  update(sugs, tr) {
    for (const e of tr.effects) {
      if (e.is(setSuggestionsEffect))
        return e.value
      if (e.is(removeSuggestionEffect))
        sugs = sugs.filter(s => s.sid !== e.value)
    }
    if (!tr.docChanged)
      return sugs
    return sugs.map((s) => {
      const from = tr.changes.mapPos(s.from, -1)
      const to = tr.changes.mapPos(s.to, 1)
      const stale = s.originalText ? tr.state.sliceDoc(from, to) !== s.originalText : false
      return { ...s, from, to, stale }
    })
  },
})

export interface SuggestionGhostActions {
  accept: (sid: string) => void
  reject: (sid: string) => void
}

let suggestionGhostActions: SuggestionGhostActions | null = null

export function setSuggestionGhostActions(actions: SuggestionGhostActions | null): void {
  suggestionGhostActions = actions
}

/** 精简幽灵：summary + 绿字 + 接受/拒绝（无 ⌘K 的 regenerate / follow-up） */
class SuggestionGhostWidget extends WidgetType {
  readonly sid: string
  readonly newText: string
  readonly summary: string
  readonly stale: boolean

  constructor(sid: string, newText: string, summary: string, stale: boolean) {
    super()
    this.sid = sid
    this.newText = newText
    this.summary = summary
    this.stale = stale
  }

  eq(other: SuggestionGhostWidget) {
    return other.sid === this.sid
      && other.newText === this.newText
      && other.summary === this.summary
      && other.stale === this.stale
  }

  toDOM() {
    const root = document.createElement('div')
    root.className = 'cm-inline-edit-preview'
    root.setAttribute('contenteditable', 'false')

    const meta = document.createElement('div')
    meta.className = 'cm-inline-edit-meta'
    meta.textContent = this.stale
      ? '原文已变动 · 无法接受'
      : (this.summary.trim() || '修订预览')
    root.appendChild(meta)

    const ghost = document.createElement('div')
    ghost.className = 'cm-inline-edit-ghost'
    ghost.textContent = this.newText || '（无内容）'
    root.appendChild(ghost)

    const toolbar = document.createElement('div')
    toolbar.className = 'cm-inline-edit-toolbar'

    const addBtn = (label: string, className: string, onClick: () => void, disabled = false) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = className
      btn.textContent = label
      btn.disabled = disabled
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!btn.disabled)
          onClick()
      })
      toolbar.appendChild(btn)
    }

    if (!this.stale) {
      addBtn('接受', 'cm-inline-edit-btn cm-inline-edit-btn-accept', () => {
        suggestionGhostActions?.accept(this.sid)
      })
    }
    addBtn(this.stale ? '移除' : '拒绝', 'cm-inline-edit-btn cm-inline-edit-btn-reject', () => {
      suggestionGhostActions?.reject(this.sid)
    })

    root.appendChild(toolbar)
    return root
  }

  ignoreEvent() {
    return true
  }
}

function buildSuggestionGhostDecos(state: EditorState) {
  const docLen = state.doc.length
  const ranges = []
  for (const s of state.field(suggestionsField)) {
    const from = Math.max(0, Math.min(s.from, docLen))
    const to = Math.max(from, Math.min(s.to, docLen))
    if (to > from) {
      ranges.push(Decoration.mark({ class: 'cm-inline-edit-old' }).range(from, to))
    }
    ranges.push(Decoration.widget({
      widget: new SuggestionGhostWidget(s.sid, s.newText, s.summary, s.stale),
      side: 1,
      block: true,
    }).range(to))
  }
  return Decoration.set(ranges, true)
}

/** 从 suggestionsField 派生多段红绿幽灵 */
export const suggestionGhostDecorations = StateField.define({
  create: state => buildSuggestionGhostDecos(state),
  update(deco, tr) {
    const sugChanged = tr.effects.some(
      e => e.is(setSuggestionsEffect) || e.is(removeSuggestionEffect),
    )
    if (!tr.docChanged && !sugChanged)
      return deco
    return buildSuggestionGhostDecos(tr.state)
  },
  provide: f => EditorView.decorations.from(f),
})

/**
 * 禁止用户编辑任一 suggestion 锁定区间。
 * 带 setSuggestions / removeSuggestion 的事务放行（accept / reject / clear）。
 */
export function suggestionGhostChangeFilter() {
  return EditorState.changeFilter.of((tr: Transaction) => {
    if (!tr.docChanged)
      return true
    if (tr.effects.some(e => e.is(setSuggestionsEffect) || e.is(removeSuggestionEffect)))
      return true
    const sugs = tr.startState.field(suggestionsField, false) ?? []
    if (!sugs.length)
      return true
    let blocked = false
    tr.changes.iterChangedRanges((fromA, toA) => {
      for (const s of sugs) {
        if (s.from === s.to)
          continue
        if (fromA < s.to && toA > s.from)
          blocked = true
      }
    })
    return !blocked
  })
}
