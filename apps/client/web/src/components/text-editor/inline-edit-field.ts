import type { Transaction } from '@codemirror/state'
import { EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'

export interface InlineEditState {
  from: number
  to: number
  originalText: string
  aiText: string
  instruction: string
  streaming: boolean
  /** 补充：预览旁指令进入编辑态 */
  editingInstruction: boolean
}

export interface InlineEditActions {
  stop: () => void
  accept: () => void
  reject: () => void
  regenerate: () => void
  /** 进入指令原地编辑 */
  followUp: () => void
  /** 确认补充指令并重新生成预览 */
  submitFollowUp: (instruction: string) => void
  /** 取消指令编辑 */
  cancelFollowUp: () => void
}

/** Session / React 注入；Widget 点击时调用 */
let inlineEditActions: InlineEditActions | null = null

export function setInlineEditActions(actions: InlineEditActions | null): void {
  inlineEditActions = actions
}

export const startInlineEditEffect = StateEffect.define<Omit<InlineEditState, 'aiText' | 'streaming' | 'editingInstruction'> & {
  aiText?: string
  streaming?: boolean
  editingInstruction?: boolean
}>()
export const setInlineAiTextEffect = StateEffect.define<{ aiText: string, streaming: boolean }>()
export const setEditingInstructionEffect = StateEffect.define<boolean>()
export const clearInlineEditEffect = StateEffect.define<null>()

/** 绿字预览 + 下方操作条，插在选区之后（正文内，不进 doc） */
class GhostPreviewWidget extends WidgetType {
  readonly text: string
  readonly streaming: boolean
  readonly instruction: string
  readonly editingInstruction: boolean

  constructor(text: string, streaming: boolean, instruction: string, editingInstruction: boolean) {
    super()
    this.text = text
    this.streaming = streaming
    this.instruction = instruction
    this.editingInstruction = editingInstruction
  }

  eq(other: GhostPreviewWidget) {
    return other.text === this.text
      && other.streaming === this.streaming
      && other.instruction === this.instruction
      && other.editingInstruction === this.editingInstruction
  }

  toDOM() {
    const root = document.createElement('div')
    root.className = 'cm-inline-edit-preview'
    root.setAttribute('contenteditable', 'false')

    const meta = document.createElement('div')
    meta.className = 'cm-inline-edit-meta'

    if (this.streaming) {
      meta.textContent = `生成中… · ${this.instruction}`
    }
    else if (this.editingInstruction) {
      const label = document.createElement('span')
      label.className = 'cm-inline-edit-meta-label'
      label.textContent = '预览 · '
      meta.appendChild(label)

      const input = document.createElement('input')
      input.type = 'text'
      input.className = 'cm-inline-edit-instruction-input'
      input.value = this.instruction
      input.addEventListener('keydown', (e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          const next = input.value.trim()
          if (next)
            inlineEditActions?.submitFollowUp(next)
        }
        else if (e.key === 'Escape') {
          e.preventDefault()
          inlineEditActions?.cancelFollowUp()
        }
      })
      input.addEventListener('mousedown', e => e.stopPropagation())
      meta.appendChild(input)
      requestAnimationFrame(() => {
        input.focus()
        const len = input.value.length
        input.setSelectionRange(len, len)
      })
    }
    else {
      meta.textContent = `预览 · ${this.instruction}`
    }
    root.appendChild(meta)

    const ghost = document.createElement('div')
    ghost.className = 'cm-inline-edit-ghost'
    ghost.textContent = this.text || (this.streaming ? '…' : '（无内容）')
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

    if (this.streaming) {
      addBtn('停止', 'cm-inline-edit-btn cm-inline-edit-btn-stop', () => inlineEditActions?.stop())
    }
    else if (this.editingInstruction) {
      addBtn('确认', 'cm-inline-edit-btn cm-inline-edit-btn-accept', () => {
        const input = root.querySelector('.cm-inline-edit-instruction-input') as HTMLInputElement | null
        const next = input?.value.trim() ?? ''
        if (next)
          inlineEditActions?.submitFollowUp(next)
      })
      addBtn('取消', 'cm-inline-edit-btn', () => inlineEditActions?.cancelFollowUp())
    }
    else {
      addBtn('重新生成', 'cm-inline-edit-btn', () => inlineEditActions?.regenerate())
      addBtn('补充', 'cm-inline-edit-btn', () => inlineEditActions?.followUp())
      addBtn('接受 y', 'cm-inline-edit-btn cm-inline-edit-btn-accept', () => inlineEditActions?.accept())
      addBtn('拒绝 j', 'cm-inline-edit-btn cm-inline-edit-btn-reject', () => inlineEditActions?.reject())
    }

    root.appendChild(toolbar)
    return root
  }

  ignoreEvent() {
    return true
  }
}

function buildInlineDecos(state: EditorState, edit: InlineEditState) {
  const docLen = state.doc.length
  const from = Math.max(0, Math.min(edit.from, docLen))
  const to = Math.max(from, Math.min(edit.to, docLen))
  const ranges = []
  if (to > from) {
    ranges.push(Decoration.mark({ class: 'cm-inline-edit-old' }).range(from, to))
  }
  ranges.push(Decoration.widget({
    widget: new GhostPreviewWidget(
      edit.aiText,
      edit.streaming,
      edit.instruction,
      edit.editingInstruction,
    ),
    side: 1,
    block: true,
  }).range(to))
  return Decoration.set(ranges, true)
}

export const inlineEditField = StateField.define<InlineEditState | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(clearInlineEditEffect))
        return null
      if (e.is(startInlineEditEffect)) {
        return {
          from: e.value.from,
          to: e.value.to,
          originalText: e.value.originalText,
          instruction: e.value.instruction,
          aiText: e.value.aiText ?? '',
          streaming: e.value.streaming ?? true,
          editingInstruction: e.value.editingInstruction ?? false,
        }
      }
      if (e.is(setInlineAiTextEffect) && value) {
        return {
          ...value,
          aiText: e.value.aiText,
          streaming: e.value.streaming,
          editingInstruction: e.value.streaming ? false : value.editingInstruction,
        }
      }
      if (e.is(setEditingInstructionEffect) && value) {
        return { ...value, editingInstruction: e.value }
      }
    }
    if (!value || !tr.docChanged)
      return value
    const from = tr.changes.mapPos(value.from, -1)
    const to = tr.changes.mapPos(value.to, 1)
    if (value.originalText && tr.state.sliceDoc(from, to) !== value.originalText)
      return null
    return { ...value, from, to }
  },
})

/** 从 inlineEditField 派生 decorations */
export const inlineEditDecorations = StateField.define({
  create: (state) => {
    const edit = state.field(inlineEditField)
    return edit ? buildInlineDecos(state, edit) : Decoration.none
  },
  update(deco, tr) {
    const edit = tr.state.field(inlineEditField)
    const prev = tr.startState.field(inlineEditField)
    if (edit === prev && !tr.docChanged && !tr.effects.some(e =>
      e.is(startInlineEditEffect)
      || e.is(setInlineAiTextEffect)
      || e.is(clearInlineEditEffect)
      || e.is(setEditingInstructionEffect),
    )) {
      return deco
    }
    return edit ? buildInlineDecos(tr.state, edit) : Decoration.none
  },
  provide: f => EditorView.decorations.from(f),
})

/** 禁止用户编辑 inline 锁定选区；Accept（带 clear 的写入）放行 */
export function inlineEditChangeFilter() {
  return EditorState.changeFilter.of((tr: Transaction) => {
    if (!tr.docChanged)
      return true
    if (tr.effects.some(e => e.is(clearInlineEditEffect)))
      return true
    const edit = tr.startState.field(inlineEditField, false)
    if (!edit || edit.from === edit.to)
      return true
    let blocked = false
    tr.changes.iterChangedRanges((fromA, toA) => {
      if (fromA < edit.to && toA > edit.from)
        blocked = true
    })
    return !blocked
  })
}

export function sanitizeInlineOutput(raw: string): string {
  let text = raw.trim()
  text = text.replace(/^```[\w-]*\n?/, '').replace(/\n?```$/, '')
  const open = text.indexOf('<focus>')
  const close = text.indexOf('</focus>')
  if (open !== -1 && close !== -1 && close > open) {
    text = text.slice(open + '<focus>'.length, close).trim()
  }
  else {
    text = text.replace(/<\/?focus>/g, '').trim()
  }
  return text
}

export function buildInlineUserMessage(params: {
  instruction: string
  docBefore: string
  selectedText: string
  docAfter: string
}): string {
  return [
    `用户指令：${params.instruction}`,
    '',
    '以下是一篇文章的全文。请仔细阅读；只需改写 <focus>…</focus> 内的段落，标签外只读。',
    '你的输出应仅为改写后的 focus 正文（不要标签、不要全文、不要解释）。',
    '',
    `${params.docBefore}<focus>`,
    params.selectedText,
    `</focus>${params.docAfter}`,
  ].join('\n')
}
