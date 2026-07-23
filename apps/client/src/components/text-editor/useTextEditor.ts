import type { AgentErrorInfo } from '@components/copilot/AgentErrorBanner'
import type { RefObject } from 'react'
import type { EditorQuote } from './editor-quotes'
import type { EditorWriteProposal } from './EditorChatPanel'
import type { InlineEditState } from './inline-edit-field'
import type { SelectionRange, TextEditorSession, WriterAgent } from './TextEditorSession'
import type { Suggestion } from './types'
import { useAgent } from '@copilotkit/react-core/v2'
import { ThemeStore } from '@stores/theme-store'
import { useAtomValue } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { setInlineEditActions } from './inline-edit-field'
import { setSuggestionGhostActions } from './suggestion-field'
import { TextEditorSession as Session } from './TextEditorSession'

export interface InlinePromptState {
  range: SelectionRange
  anchor: { top: number, left: number }
  initialInstruction?: string
}

export interface UseTextEditorResult {
  mountRef: RefObject<HTMLDivElement | null>
  polishing: boolean
  suggestions: Suggestion[]
  agentError: AgentErrorInfo | null
  inlineEdit: InlineEditState | null
  inlinePrompt: InlinePromptState | null
  pendingQuotes: EditorQuote[]
  polish: () => void
  accept: (sid: string) => void
  reject: (sid: string) => void
  acceptAll: () => void
  rejectAll: () => void
  dismissError: () => void
  closeInlinePrompt: () => void
  submitInlinePrompt: (instruction: string) => void
  acceptInline: () => void
  rejectInline: () => void
  stopInline: () => void
  regenerateInline: () => void
  followUpInline: () => void
  removeQuote: (id: string) => void
  consumeQuotes: () => EditorQuote[]
  getDocument: () => string
  applyProposal: (proposal: EditorWriteProposal) => boolean
}

export function useTextEditor(): UseTextEditorResult {
  const { agent } = useAgent({ agentId: 'writer' })
  const mountRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<TextEditorSession | null>(null)
  const agentRef = useRef(agent)
  agentRef.current = agent
  const mode = useAtomValue(ThemeStore.modeAtom)

  const [polishing, setPolishing] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [agentError, setAgentError] = useState<AgentErrorInfo | null>(null)
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null)
  const [inlinePrompt, setInlinePrompt] = useState<InlinePromptState | null>(null)
  const [pendingQuotes, setPendingQuotes] = useState<EditorQuote[]>([])
  const lastInlineRef = useRef<{ instruction: string } | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (mount == null)
      return

    const session = new Session({
      mount,
      getAgent: () => agentRef.current as unknown as WriterAgent | undefined,
      onSuggestionsChange: setSuggestions,
      onPolishingChange: setPolishing,
      onAgentError: setAgentError,
      onSelectionAction: (action, range) => {
        if (action === 'edit') {
          const anchor = session.coordsAtPos(range.to) ?? { top: 120, left: 120, bottom: 140 }
          setInlinePrompt({
            range,
            anchor: { top: anchor.bottom, left: anchor.left },
          })
        }
        else {
          setPendingQuotes(prev => [
            ...prev,
            {
              id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              text: range.text,
              from: range.from,
              to: range.to,
            },
          ])
        }
      },
      onInlineEditChange: setInlineEdit,
    })
    session.start()
    sessionRef.current = session

    return () => {
      session.dispose()
      sessionRef.current = null
      setInlineEditActions(null)
      setSuggestionGhostActions(null)
    }
  }, [mode])

  useEffect(() => {
    setInlineEditActions({
      stop: () => sessionRef.current?.stopInline(),
      accept: () => sessionRef.current?.acceptInline(),
      reject: () => sessionRef.current?.rejectInline(),
      followUp: () => sessionRef.current?.beginFollowUpEdit(),
      cancelFollowUp: () => sessionRef.current?.cancelFollowUpEdit(),
      submitFollowUp: (instruction) => {
        const edit = sessionRef.current?.getInlineEdit()
        if (!edit)
          return
        lastInlineRef.current = { instruction }
        setAgentError(null)
        void sessionRef.current?.inlineEdit({
          from: edit.from,
          to: edit.to,
          text: edit.originalText,
          instruction,
        })
      },
      regenerate: () => {
        const edit = sessionRef.current?.getInlineEdit()
        if (!edit)
          return
        const instruction = lastInlineRef.current?.instruction || edit.instruction
        lastInlineRef.current = { instruction }
        setAgentError(null)
        void sessionRef.current?.inlineEdit({
          from: edit.from,
          to: edit.to,
          text: edit.originalText,
          instruction,
        })
      },
    })
    setSuggestionGhostActions({
      accept: sid => sessionRef.current?.accept(sid),
      reject: sid => sessionRef.current?.reject(sid),
    })
    return () => {
      setInlineEditActions(null)
      setSuggestionGhostActions(null)
    }
  }, [])

  return {
    mountRef,
    polishing,
    suggestions,
    agentError,
    inlineEdit,
    inlinePrompt,
    pendingQuotes,
    polish: () => {
      setAgentError(null)
      void sessionRef.current?.polish()
    },
    accept: sid => sessionRef.current?.accept(sid),
    reject: sid => sessionRef.current?.reject(sid),
    acceptAll: () => sessionRef.current?.acceptAll(),
    rejectAll: () => sessionRef.current?.rejectAll(),
    dismissError: () => setAgentError(null),
    closeInlinePrompt: () => setInlinePrompt(null),
    submitInlinePrompt: (instruction) => {
      const prompt = inlinePrompt
      if (!prompt)
        return
      lastInlineRef.current = { instruction }
      setInlinePrompt(null)
      setAgentError(null)
      void sessionRef.current?.inlineEdit({
        from: prompt.range.from,
        to: prompt.range.to,
        text: prompt.range.text,
        instruction,
      })
    },
    acceptInline: () => sessionRef.current?.acceptInline(),
    rejectInline: () => sessionRef.current?.rejectInline(),
    stopInline: () => sessionRef.current?.stopInline(),
    regenerateInline: () => {
      const edit = sessionRef.current?.getInlineEdit()
      if (!edit)
        return
      const instruction = lastInlineRef.current?.instruction || edit.instruction
      lastInlineRef.current = { instruction }
      setAgentError(null)
      void sessionRef.current?.inlineEdit({
        from: edit.from,
        to: edit.to,
        text: edit.originalText,
        instruction,
      })
    },
    followUpInline: () => sessionRef.current?.beginFollowUpEdit(),
    removeQuote: id => setPendingQuotes(prev => prev.filter(q => q.id !== id)),
    consumeQuotes: () => {
      const taken = pendingQuotes
      setPendingQuotes([])
      return taken
    },
    getDocument: () => sessionRef.current?.getDocText() ?? '',
    applyProposal: (proposal) => {
      setAgentError(null)
      return sessionRef.current?.applyProposal(proposal) ?? false
    },
  }
}
