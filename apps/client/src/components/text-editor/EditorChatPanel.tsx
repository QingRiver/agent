import type { WriterChangeSummary } from '@agent/protocol'
import type { EditorQuote } from './editor-quotes'
import { WRITER_CHANGE_SUMMARIES_EVENT } from '@agent/protocol'
import { Conversation } from '@apis/conversation-api'
import { ConversationChat } from '@components/copilot/ConversationChat'
import { useAgent, useCopilotKit } from '@copilotkit/react-core/v2'
import { useEffect, useRef, useState } from 'react'
import {
  hideEditorChatPolishedText,
  setEditorChatSuppressDocumentDump,
} from './editor-chat-message'
import { filterFreshQuotes, formatQuotesForMessage } from './editor-quotes'
import { EditorChatAssistantMessage } from './EditorChatAssistantMessage'
import { EditorQuoteChips } from './EditorQuoteChips'

export interface EditorWriteProposal {
  baseline: string
  polished: string
  changes: WriterChangeSummary[]
}

interface CustomEventLike {
  type?: string
  name?: string
  value?: unknown
}

interface EditorChatAgent {
  state?: Record<string, unknown> | null
  setState?: (state: Record<string, unknown>) => void
  addMessage: (message: unknown) => void
  subscribe?: (subscriber: {
    onCustomEvent?: (ctx: { event: CustomEventLike }) => void
    onEvent?: (ctx: { event: CustomEventLike }) => void
  }) => { unsubscribe: () => void }
  runAgent: (
    input?: Record<string, unknown>,
    subscriber?: {
      onCustomEvent?: (ctx: { event: CustomEventLike }) => void
      onEvent?: (ctx: { event: CustomEventLike }) => void
    },
  ) => Promise<unknown>
}

function writeAgentState(agent: EditorChatAgent, state: Record<string, unknown>) {
  if (typeof agent.setState === 'function')
    agent.setState(state)
  else
    agent.state = state
}

function proposalFromCustomValue(value: unknown): EditorWriteProposal | null {
  const v = value as {
    changes?: WriterChangeSummary[]
    polished?: string
    baseline?: string
  } | null
  if (typeof v?.polished !== 'string' || !v.polished.trim())
    return null
  if (typeof v.baseline !== 'string')
    return null
  return {
    baseline: v.baseline,
    polished: v.polished,
    changes: Array.isArray(v.changes) ? v.changes : [],
  }
}

function ingestWriterCustomEvent(
  event: CustomEventLike,
  onProposal: (p: EditorWriteProposal) => void,
) {
  if (event.type && event.type !== 'CUSTOM')
    return
  if (event.name !== WRITER_CHANGE_SUMMARIES_EVENT)
    return
  const proposal = proposalFromCustomValue(event.value)
  if (proposal)
    onProposal(proposal)
}

/** 与 graph heuristicEditorIntent 对齐的粗判：write 时抑制全文气泡 */
function likelyWriteIntent(text: string): boolean {
  return /润色|改写|扩写|缩写|展开说明|展开一下|续写|纠错|改成|改为|生成修改|更正式|更口语|精简|压缩/.test(text.trim())
}

interface EditorChatPanelProps {
  quotes: EditorQuote[]
  onRemoveQuote: (id: string) => void
  onConsumeQuotes: () => EditorQuote[]
  getDocument: () => string
  onApplyProposal: (proposal: EditorWriteProposal) => boolean
  onChatBusyChange?: (busy: boolean) => void
  blockInput?: boolean
  blockInputHint?: string
}

export function EditorChatPanel({
  quotes,
  onRemoveQuote,
  onConsumeQuotes,
  getDocument,
  onApplyProposal,
  onChatBusyChange,
  blockInput = false,
  blockInputHint,
}: EditorChatPanelProps) {
  const [threadId, setThreadId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const { agent: rawAgent } = useAgent({ agentId: 'editorChat' })
  const agent = rawAgent as unknown as EditorChatAgent | null
  const { copilotkit } = useCopilotKit()
  const quotesRef = useRef(quotes)
  quotesRef.current = quotes
  const getDocumentRef = useRef(getDocument)
  getDocumentRef.current = getDocument
  const onApplyProposalRef = useRef(onApplyProposal)
  onApplyProposalRef.current = onApplyProposal
  const proposalRef = useRef<EditorWriteProposal | null>(null)
  const lastAppliedKeyRef = useRef<string | null>(null)

  function autoApplyProposal(p: EditorWriteProposal) {
    const key = `${p.baseline}\0${p.polished}`
    if (lastAppliedKeyRef.current === key)
      return
    lastAppliedKeyRef.current = key
    proposalRef.current = p
    hideEditorChatPolishedText(p.polished)
    setEditorChatSuppressDocumentDump(false)
    const ok = onApplyProposalRef.current(p)
    if (ok)
      setApplyError(null)
    else
      setApplyError('自动应用失败：文稿可能已改动，或行内改写尚未结束。')
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const c = await Conversation.create('editorChat')
        if (!cancelled)
          setThreadId(c.id)
      }
      catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!agent?.subscribe)
      return
    const { unsubscribe } = agent.subscribe({
      onCustomEvent: ({ event }) => {
        ingestWriterCustomEvent(event, autoApplyProposal)
      },
      onEvent: ({ event }) => {
        ingestWriterCustomEvent(event, autoApplyProposal)
      },
    })
    return unsubscribe
  }, [agent])

  useEffect(() => {
    if (!agent)
      return
    const original = agent.runAgent.bind(agent)
    agent.runAgent = async (input, subscriber) => {
      const prev = agent.state != null && typeof agent.state === 'object'
        ? { ...agent.state }
        : {}
      const baseline = typeof prev.documentBaseline === 'string' && prev.documentBaseline.trim()
        ? prev.documentBaseline
        : getDocumentRef.current()
      writeAgentState(agent, {
        ...prev,
        editCase: 'document',
        documentBaseline: baseline,
      })
      return original(input ?? {}, subscriber)
    }
    return () => {
      agent.runAgent = original
    }
  }, [agent])

  async function runChat(value: string) {
    const trimmed = value.trim()
    if (!trimmed || !agent)
      return

    const baseline = getDocument()
    if (!baseline.trim()) {
      setApplyError('编辑器正文为空，无法生成修改建议。')
      return
    }

    const q = filterFreshQuotes(baseline, [...quotesRef.current])
    if (quotesRef.current.length > 0)
      onConsumeQuotes()

    const content = formatQuotesForMessage(q, trimmed)
    const prev = agent.state != null && typeof agent.state === 'object' ? { ...agent.state } : {}
    const nextState: Record<string, unknown> = {
      ...prev,
      editCase: 'document',
      documentBaseline: baseline,
      polishInstruction: trimmed,
      focuses: q.map(x => ({ from: x.from, to: x.to, text: x.text })),
    }
    delete nextState.forceIntent
    writeAgentState(agent, nextState)

    agent.addMessage({
      id: `editor-chat-${Date.now()}`,
      role: 'user',
      content,
    })

    proposalRef.current = null
    lastAppliedKeyRef.current = null
    setEditorChatSuppressDocumentDump(likelyWriteIntent(trimmed))
    onChatBusyChange?.(true)
    setApplyError(null)
    const collect = {
      onCustomEvent: ({ event }: { event: CustomEventLike }) => {
        ingestWriterCustomEvent(event, autoApplyProposal)
      },
      onEvent: ({ event }: { event: CustomEventLike }) => {
        ingestWriterCustomEvent(event, autoApplyProposal)
      },
    }
    try {
      await agent.runAgent({}, collect)
    }
    catch {
      await copilotkit.runAgent({ agent: rawAgent! })
    }
    finally {
      onChatBusyChange?.(false)
      setEditorChatSuppressDocumentDump(false)
    }
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-destructive">
        对话初始化失败：
        {error}
      </div>
    )
  }

  if (!threadId) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
        加载对话…
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <EditorQuoteChips quotes={quotes} onRemove={onRemoveQuote} />
      {applyError && (
        <p className="shrink-0 border-b border-border px-3 py-2 text-xs text-destructive">{applyError}</p>
      )}
      <div className="min-h-0 flex-1">
        <ConversationChat
          graphsName="editorChat"
          threadId={threadId}
          chatClassName="h-full min-h-0"
          placeholder={quotes.length > 0 ? '输入问题或改写指令…' : '讨论文稿，或描述想要的修改…'}
          blockInput={blockInput}
          blockInputHint={blockInputHint}
          assistantMessage={EditorChatAssistantMessage}
          onSubmitMessage={async (value) => {
            await runChat(value)
          }}
        />
      </div>
    </div>
  )
}
