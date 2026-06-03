import type { BaseEvent } from '@ag-ui/core'
import type { StreamMapContext } from '../pipeline/messagesInProgress'
import type { LangGraphStreamEvent } from '../stream/fromLangGraphEvents'
import { randomUUID } from '@ag-ui/client'
import { EventType } from '@ag-ui/core'
import { LangGraphEventTypes } from '../langGraphEventTypes'
import {
  clearMessageInProgress,
  getMessageInProgress,
  setMessageInProgress,
} from '../pipeline/messagesInProgress'

function textFromChunkContent(content: unknown): string {
  if (typeof content === 'string')
    return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string')
          return part
        if (part != null && typeof part === 'object' && 'text' in part)
          return String((part as { text?: string }).text ?? '')
        return ''
      })
      .join('')
  }
  return ''
}

function chunkData(event: LangGraphStreamEvent): Record<string, unknown> | undefined {
  const data = event.data
  if (data == null || typeof data !== 'object')
    return undefined
  const chunk = (data as { chunk?: unknown }).chunk
  if (chunk != null && typeof chunk === 'object')
    return chunk as Record<string, unknown>
  return undefined
}

export function mapLangGraphEventToAgUi(
  event: LangGraphStreamEvent,
  runId: string,
  ctx: StreamMapContext,
): BaseEvent[] {
  const out: BaseEvent[] = []

  if (event.event === LangGraphEventTypes.OnChatModelStream) {
    const chunk = chunkData(event)
    if (!chunk)
      return out

    if (chunk.response_metadata != null
      && typeof chunk.response_metadata === 'object'
      && (chunk.response_metadata as { finish_reason?: string }).finish_reason) {
      return out
    }

    const inProgress = getMessageInProgress(ctx, runId)
    const messageId = typeof chunk.id === 'string' ? chunk.id : inProgress?.id
    const toolChunks = (chunk as { tool_call_chunks?: Array<{ id?: string, name?: string, args?: string }> }).tool_call_chunks
    const toolChunk = toolChunks?.[0]
    const text = textFromChunkContent(chunk.content).trim()

    if (toolChunk?.name) {
      const toolCallId = toolChunk.id ?? randomUUID()
      if (!inProgress?.id) {
        const mid = typeof chunk.id === 'string' ? chunk.id : randomUUID()
        out.push({
          type: EventType.TEXT_MESSAGE_START,
          messageId: mid,
          role: 'assistant',
        })
        if (text) {
          out.push({
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: mid,
            delta: text,
          })
        }
        out.push({ type: EventType.TEXT_MESSAGE_END, messageId: mid })
      }
      else if (text && inProgress.id && !inProgress.toolCallId) {
        out.push({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: inProgress.id,
          delta: text,
        })
      }

      out.push({
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: toolChunk.name,
        parentMessageId: typeof chunk.id === 'string' ? chunk.id : messageId,
      })
      setMessageInProgress(ctx, runId, {
        id: typeof chunk.id === 'string' ? chunk.id : randomUUID(),
        toolCallId,
        toolCallName: toolChunk.name,
      })
      ctx.emittedToolCallStartIds.add(toolCallId)
      return out
    }

    if (toolChunk?.args && inProgress?.toolCallId) {
      out.push({
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: inProgress.toolCallId,
        delta: toolChunk.args,
      })
      return out
    }

    if (text && !toolChunk) {
      let active = getMessageInProgress(ctx, runId)
      if (!active) {
        const mid = typeof chunk.id === 'string' ? chunk.id : randomUUID()
        out.push({
          type: EventType.TEXT_MESSAGE_START,
          messageId: mid,
          role: 'assistant',
        })
        setMessageInProgress(ctx, runId, { id: mid, toolCallId: null, toolCallName: null })
        active = getMessageInProgress(ctx, runId)
      }
      if (active?.id) {
        out.push({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: active.id,
          delta: text,
        })
      }
      return out
    }

    return out
  }

  if (event.event === LangGraphEventTypes.OnChatModelEnd) {
    const inProgress = getMessageInProgress(ctx, runId)
    if (inProgress?.toolCallId) {
      out.push({
        type: EventType.TOOL_CALL_END,
        toolCallId: inProgress.toolCallId,
      })
      clearMessageInProgress(ctx, runId)
      return out
    }
    if (inProgress?.id) {
      out.push({ type: EventType.TEXT_MESSAGE_END, messageId: inProgress.id })
      clearMessageInProgress(ctx, runId)
    }
    return out
  }

  if (event.event === LangGraphEventTypes.OnToolEnd) {
    const data = event.data
    const output = data != null && typeof data === 'object'
      ? (data as { output?: unknown }).output
      : undefined
    let toolOutput = output
    if (toolOutput != null && typeof toolOutput === 'object') {
      const rec = toolOutput as Record<string, unknown>
      const fromUpdate = rec.update
      if (fromUpdate != null && typeof fromUpdate === 'object') {
        const messages = (fromUpdate as { messages?: unknown[] }).messages
        const toolMsg = Array.isArray(messages)
          ? messages.find(m => m != null && typeof m === 'object' && (m as { type?: string }).type === 'tool')
          : undefined
        if (toolMsg != null)
          toolOutput = toolMsg
      }
    }

    if (toolOutput != null && typeof toolOutput === 'object') {
      const tm = toolOutput as {
        tool_call_id?: string
        name?: string
        content?: unknown
        id?: string
      }
      const toolCallId = tm.tool_call_id
      if (toolCallId) {
        if (!ctx.emittedToolCallStartIds.has(toolCallId)) {
          ctx.emittedToolCallStartIds.add(toolCallId)
          out.push({
            type: EventType.TOOL_CALL_START,
            toolCallId,
            toolCallName: tm.name ?? '',
            parentMessageId: tm.id,
          })
          const input = data != null && typeof data === 'object'
            ? (data as { input?: unknown }).input
            : undefined
          out.push({
            type: EventType.TOOL_CALL_ARGS,
            toolCallId,
            delta: JSON.stringify(input ?? {}),
          })
          out.push({ type: EventType.TOOL_CALL_END, toolCallId })
        }
        const content = typeof tm.content === 'string'
          ? tm.content
          : JSON.stringify(tm.content ?? '')
        out.push({
          type: EventType.TOOL_CALL_RESULT,
          messageId: randomUUID(),
          toolCallId,
          content,
          role: 'tool',
        })
      }
    }
    return out
  }

  return out
}

export function emitSummaryTextEvents(summary: string): BaseEvent[] {
  const messageId = randomUUID()
  return [
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: summary,
    },
    { type: EventType.TEXT_MESSAGE_END, messageId },
  ]
}
