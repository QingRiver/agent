import type { BaseEvent, RunAgentInput } from '@ag-ui/core'
import type { AgUiMessage } from '../../shared/conversation'
import { EventType } from '@ag-ui/core'
import { getRequestContext } from '../context/requestContext'
import { saveConversationMessages } from './repository'

function extractAssistantMessages(events: readonly BaseEvent[]): AgUiMessage[] {
  const out: AgUiMessage[] = []
  let current: { messageId: string, role: string, content: string } | null = null

  for (const ev of events) {
    if (ev.type === EventType.TEXT_MESSAGE_START) {
      const e = ev as unknown as { messageId: string, role?: string }
      current = { messageId: e.messageId, role: e.role ?? 'assistant', content: '' }
    }
    else if (ev.type === EventType.TEXT_MESSAGE_CONTENT && current) {
      const e = ev as unknown as { delta?: string }
      current.content += e.delta ?? ''
    }
    else if (ev.type === EventType.TEXT_MESSAGE_END && current) {
      out.push({
        id: current.messageId,
        role: current.role,
        content: current.content,
      })
      current = null
    }
  }

  return out
}

function mergeMessages(
  inputMessages: AgUiMessage[],
  collected: readonly BaseEvent[],
): AgUiMessage[] {
  const assistant = extractAssistantMessages(collected)
  if (assistant.length === 0)
    return [...inputMessages]

  const ids = new Set(inputMessages.map(m => String(m.id ?? '')))
  const merged = [...inputMessages]
  for (const msg of assistant) {
    const id = String(msg.id ?? '')
    if (!ids.has(id)) {
      merged.push(msg)
      ids.add(id)
    }
  }
  return merged
}

/** 将 AG-UI 文本消息投影到 app.sqlite（读模型）；图执行态留在 checkpoints.sqlite */
export function mirrorConversationMessages(
  input: RunAgentInput,
  collected: readonly BaseEvent[],
): void {
  const ctx = getRequestContext()
  if (ctx.mode !== 'auth' || !ctx.userId)
    return

  const messages = mergeMessages(
    (input.messages ?? []) as AgUiMessage[],
    collected,
  )
  saveConversationMessages(ctx.userId, input.threadId, messages)
}
