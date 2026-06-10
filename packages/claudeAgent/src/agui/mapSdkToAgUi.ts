import type { BaseEvent } from '@ag-ui/core'
import type { SDKMessage } from '../sdk'
import type { ClaudeAguiMapState } from './types'
import { randomUUID } from 'node:crypto'
import { EventType } from '@ag-ui/core'

type SdkStreamEvent = Extract<SDKMessage, { type: 'stream_event' }>['event']

function stringifyContent(content: unknown): string {
  if (typeof content === 'string')
    return content
  if (content == null)
    return ''
  return JSON.stringify(content)
}

function toolCallEvents(toolCallId: string, name: string, input: unknown): BaseEvent[] {
  return [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId,
      toolCallName: name,
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId,
      delta: stringifyContent(input),
    },
    {
      type: EventType.TOOL_CALL_END,
      toolCallId,
    },
  ]
}

function toolResultEvent(toolCallId: string, content: unknown, isError?: boolean): BaseEvent {
  return {
    type: EventType.TOOL_CALL_RESULT,
    messageId: randomUUID(),
    toolCallId,
    content: stringifyContent(content),
    role: 'tool',
    ...(isError ? { error: stringifyContent(content) } : {}),
  }
}

function mapStreamEvent(
  event: SdkStreamEvent,
  state: ClaudeAguiMapState,
): BaseEvent[] {
  state.partialStreaming = true

  if (event.type === 'message_start') {
    state.activeMessageId = event.message.id
    return []
  }

  if (event.type === 'message_stop') {
    state.activeMessageId = null
    state.textBlocks.clear()
    state.toolBlocks.clear()
    return []
  }

  if (event.type === 'content_block_start') {
    const block = event.content_block
    if (block.type === 'text') {
      const messageId = randomUUID()
      state.textBlocks.set(event.index, messageId)
      state.activeMessageId = messageId
      return [{
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant',
      }]
    }
    if (block.type === 'tool_use') {
      state.toolBlocks.set(event.index, {
        toolCallId: block.id,
        name: block.name,
        ended: false,
        argsSent: false,
        pendingInput: block.input ?? {},
      })
      return [{
        type: EventType.TOOL_CALL_START,
        toolCallId: block.id,
        toolCallName: block.name,
      }]
    }
    return []
  }

  if (event.type === 'content_block_delta') {
    const delta = event.delta
    if (delta.type === 'text_delta') {
      const messageId = state.textBlocks.get(event.index) ?? state.activeMessageId
      if (!messageId || !delta.text)
        return []
      return [{
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: delta.text,
      }]
    }
    if (delta.type === 'input_json_delta') {
      const tool = state.toolBlocks.get(event.index)
      if (!tool || tool.ended || !delta.partial_json)
        return []
      tool.argsSent = true
      return [{
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: tool.toolCallId,
        delta: delta.partial_json,
      }]
    }
    return []
  }

  if (event.type === 'content_block_stop') {
    const textId = state.textBlocks.get(event.index)
    if (textId) {
      state.textBlocks.delete(event.index)
      if (state.activeMessageId === textId)
        state.activeMessageId = null
      return [{ type: EventType.TEXT_MESSAGE_END, messageId: textId }]
    }
    const tool = state.toolBlocks.get(event.index)
    if (tool && !tool.ended) {
      tool.ended = true
      state.toolBlocks.delete(event.index)
      const events: BaseEvent[] = []
      if (!tool.argsSent) {
        events.push({
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: tool.toolCallId,
          delta: stringifyContent(tool.pendingInput),
        })
      }
      events.push({ type: EventType.TOOL_CALL_END, toolCallId: tool.toolCallId })
      return events
    }
    return []
  }

  return []
}

function mapAssistantContentBlocks(content: unknown): BaseEvent[] {
  if (!Array.isArray(content))
    return []

  const events: BaseEvent[] = []
  for (const block of content) {
    if (block == null || typeof block !== 'object')
      continue
    const record = block as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string' && record.text) {
      const messageId = randomUUID()
      events.push(
        { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' },
        { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: record.text },
        { type: EventType.TEXT_MESSAGE_END, messageId },
      )
    }
    if (record.type === 'tool_use'
      && typeof record.id === 'string'
      && typeof record.name === 'string') {
      events.push(...toolCallEvents(record.id, record.name, record.input ?? {}))
    }
  }
  return events
}

function mapUserToolResults(message: SDKMessage & { type: 'user' }): BaseEvent[] {
  const events: BaseEvent[] = []

  if (message.tool_use_result != null) {
    const result = message.tool_use_result
    if (result != null && typeof result === 'object' && 'tool_use_id' in result) {
      const record = result as { tool_use_id: string, content?: unknown, is_error?: boolean }
      events.push(toolResultEvent(record.tool_use_id, record.content ?? result, record.is_error))
    }
  }

  const content = message.message.content
  if (!Array.isArray(content))
    return events

  for (const block of content) {
    if (block == null || typeof block !== 'object')
      continue
    const record = block as unknown as Record<string, unknown>
    if (record.type === 'tool_result' && typeof record.tool_use_id === 'string') {
      events.push(toolResultEvent(
        record.tool_use_id,
        record.content ?? '',
        Boolean(record.is_error),
      ))
    }
  }

  return events
}

/** 单条 Claude SDK 消息 → AG-UI 事件（需维护 state） */
export function mapSdkMessageToAgUi(
  message: SDKMessage,
  state: ClaudeAguiMapState,
): BaseEvent[] {
  if (message.type === 'stream_event')
    return mapStreamEvent(message.event, state)

  if (message.type === 'assistant') {
    if (state.partialStreaming)
      return []
    return mapAssistantContentBlocks(message.message.content)
  }

  if (message.type === 'user')
    return mapUserToolResults(message)

  if (message.type === 'result' && message.subtype !== 'success')
    return []

  return []
}
