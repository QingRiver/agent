import type { WriterChangeSummary } from '@agent/proto'
import type { EditorQuote } from './editor-quotes'
import { WRITER_CHANGE_SUMMARIES_EVENT } from '@agent/proto'
import { Conversation } from '@apis/conversation-api'
import { AssistantGraphRuntime } from '@components/assistant/AssistantGraphRuntime'
import { AssistantThread } from '@components/assistant/AssistantThread'
import { useEffect, useRef, useState } from 'react'
import {
  hideEditorChatPolishedText,
  isEditorChatInternalAssistantContent,
  setEditorChatSuppressDocumentDump,
} from './editor-chat-message'
import { filterFreshQuotes, formatQuotesForMessage } from './editor-quotes'
import { EditorQuoteChips } from './EditorQuoteChips'

export interface EditorWriteProposal {
  baseline: string
  polished: string
  changes: WriterChangeSummary[]
}

function proposalFromCustomValue(value: unknown): EditorWriteProposal | null {
  const v = value as {
    changes?: WriterChangeSummary[]
    polished?: string
    baseline?: string
  } | null
  if (typeof v?.polished !== 'string' || !v.polished.trim())
    return null
  if (typeof v?.baseline !== 'string')
    return null
  return {
    baseline: v.baseline,
    polished: v.polished,
    changes: Array.isArray(v.changes) ? v.changes : [],
  }
}

function ingestWriterCustomEvent(
  data: unknown,
  onProposal: (proposal: EditorWriteProposal) => void,
) {
  const event = data as { name?: string, payload?: unknown }
  if (event.name !== WRITER_CHANGE_SUMMARIES_EVENT)
    return
  const proposal = proposalFromCustomValue(event.payload)
  if (proposal)
    onProposal(proposal)
}

function lastHumanText(messages: readonly { type?: string, content?: unknown }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.type !== 'human' || typeof message.content !== 'string')
      continue
    const text = message.content.trim()
    if (text)
      return text
  }
  return ''
}

function rewriteLastHuman(
  messages: readonly { type?: string, content?: unknown }[],
  content: string,
) {
  const copy = messages.map(message => ({ ...message }))
  for (let i = copy.length - 1; i >= 0; i--) {
    if (copy[i]?.type === 'human') {
      copy[i] = { ...copy[i], content }
      break
    }
  }
  return copy
}

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
  const proposalRef = useRef<EditorWriteProposal | null>(null)
  const lastAppliedKeyRef = useRef<string | null>(null)
  const quotesRef = useRef(quotes)
  const pendingConfigRef = useRef<Record<string, unknown> | undefined>(undefined)
  useEffect(() => {
    quotesRef.current = quotes
  }, [quotes])

  function applyProposal(proposal: EditorWriteProposal) {
    const key = `${proposal.baseline}\0${proposal.polished}`
    if (lastAppliedKeyRef.current === key)
      return
    lastAppliedKeyRef.current = key
    proposalRef.current = proposal
    hideEditorChatPolishedText(proposal.polished)
    setEditorChatSuppressDocumentDump(false)
    const ok = onApplyProposal(proposal)
    if (ok)
      setApplyError(null)
    else
      setApplyError('自动应用失败：文稿可能已改动，或行内改写尚未结束。')
  }

  useEffect(() => {
    let cancelled = false

    async function initializeConversation() {
      const created = await Conversation.create('editor').catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
        return null
      })
      if (!cancelled && created != null)
        setThreadId(created.id)
    }

    void initializeConversation()
    return () => {
      cancelled = true
    }
  }, [])

  function prepareMessages(messages: readonly { type?: string, content?: unknown }[]) {
    const trimmed = lastHumanText(messages)
    if (!trimmed)
      return null
    const baseline = getDocument()
    if (!baseline.trim()) {
      setApplyError('编辑器正文为空，无法生成修改建议。')
      return null
    }
    const fresh = filterFreshQuotes(baseline, [...quotesRef.current])
    if (quotesRef.current.length > 0)
      onConsumeQuotes()
    proposalRef.current = null
    lastAppliedKeyRef.current = null
    setEditorChatSuppressDocumentDump(likelyWriteIntent(trimmed))
    setApplyError(null)
    pendingConfigRef.current = {
      editorPath: 'chat',
      editCase: 'document',
      writerMode: 'polish',
      reasoning: true,
      documentBaseline: baseline,
      polishInstruction: trimmed,
      focuses: fresh.map(quote => ({ from: quote.from, to: quote.to, text: quote.text })),
    }
    return rewriteLastHuman(messages, formatQuotesForMessage(fresh, trimmed))
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
        <AssistantGraphRuntime
          graph="editor"
          threadId={threadId}
          prepareMessages={prepareMessages}
          configurable={() => pendingConfigRef.current}
          onCustom={data => ingestWriterCustomEvent(data, applyProposal)}
          onRunningChange={(running) => {
            onChatBusyChange?.(running)
            if (!running)
              setEditorChatSuppressDocumentDump(false)
          }}
        >
          <AssistantThread
            placeholder={quotes.length > 0 ? '输入问题或改写指令…' : '讨论文稿，或描述想要的修改…'}
            emptyHint="讨论文稿，或描述想要的修改。"
            blocked={blockInput}
            blockInputHint={blockInputHint}
            hideAssistantText={isEditorChatInternalAssistantContent}
          />
        </AssistantGraphRuntime>
      </div>
    </div>
  )
}
