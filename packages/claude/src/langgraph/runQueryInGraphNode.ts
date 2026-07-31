import type { AIMessageChunk, BaseMessage } from '@langchain/core/messages'
import type { Options, SDKMessage } from '../sdk'
import { AIMessage } from '@langchain/core/messages'
import { mapSdkMessageToAgUi } from '../agui/mapSdkToAgUi'
import { createClaudeAguiMapState } from '../agui/types'
import { claudePackageQueryOptions } from '../config'
import { makeMessageChunkFromAnthropicEvent } from '../langchain/anthropicStreamChunks'
import { sdkAssistantToAIMessage, sdkUserToToolMessages } from '../langchain/sdkMessageToLangChain'
import { query } from '../sdk'

export const AGUI_WRITER_EVENT = 'agui'

export interface AguiWriter {
  (payload: { name: typeof AGUI_WRITER_EVENT, payload: unknown }): void
}

export interface RunQueryInGraphNodeParams {
  prompt: string
  claudeSessionId?: string | undefined
  writer?: AguiWriter | undefined
  sdkOptions?: Options | undefined
}

export interface RunQueryInGraphNodeResult {
  messages: BaseMessage[]
  claudeSessionId: string
}

function pushAguiFromMessage(
  message: SDKMessage,
  aguiState: ReturnType<typeof createClaudeAguiMapState>,
  writer?: AguiWriter,
): void {
  if (!writer)
    return
  for (const event of mapSdkMessageToAgUi(message, aguiState)) {
    writer({ name: AGUI_WRITER_EVENT, payload: event })
  }
}

function flushChunkBuffer(buffer: AIMessageChunk | null): AIMessage | null {
  if (!buffer)
    return null
  if (buffer.tool_calls?.length) {
    return new AIMessage({
      content: buffer.content as AIMessage['content'],
      additional_kwargs: buffer.additional_kwargs,
      response_metadata: buffer.response_metadata,
      ...(typeof buffer.id === 'string' ? { id: buffer.id } : {}),
      tool_calls: buffer.tool_calls,
    })
  }
  return new AIMessage({
    content: buffer.content as AIMessage['content'],
    additional_kwargs: buffer.additional_kwargs,
    response_metadata: buffer.response_metadata,
    ...(typeof buffer.id === 'string' ? { id: buffer.id } : {}),
  })
}

/**
 * LangGraph 节点内执行 Claude SDK `query()`：
 * - `writer` 推送流式 AG-UI（`name: agui`）
 * - 返回本轮新增 `BaseMessage[]` 与 `claudeSessionId`
 */
export async function runQueryInGraphNode(
  params: RunQueryInGraphNodeParams,
): Promise<RunQueryInGraphNodeResult> {
  const { prompt, claudeSessionId, writer, sdkOptions } = params
  const aguiState = createClaudeAguiMapState()
  const newMessages: BaseMessage[] = []
  let chunkBuffer: AIMessageChunk | null = null
  let sessionId = claudeSessionId ?? ''
  let sawStreamEvents = false

  const mergedOptions: Options = {
    ...claudePackageQueryOptions(),
    ...sdkOptions,
    includePartialMessages: true,
    ...(claudeSessionId ? { resume: claudeSessionId } : {}),
  }

  const stream = query({ prompt, options: mergedOptions })

  for await (const message of stream) {
    if ('session_id' in message && typeof message.session_id === 'string')
      sessionId = message.session_id

    if (message.type === 'stream_event') {
      sawStreamEvents = true
      const made = makeMessageChunkFromAnthropicEvent(message.event, {
        streamUsage: false,
        coerceContentToString: false,
      })
      if (made) {
        chunkBuffer = chunkBuffer
          ? chunkBuffer.concat(made.chunk)
          : made.chunk
      }
      pushAguiFromMessage(message, aguiState, writer)
      continue
    }

    if (message.type === 'assistant') {
      pushAguiFromMessage(message, aguiState, writer)
      if (aguiState.partialStreaming && sawStreamEvents) {
        const fromChunks = flushChunkBuffer(chunkBuffer)
        newMessages.push(fromChunks ?? sdkAssistantToAIMessage(message))
        chunkBuffer = null
      }
      else if (!aguiState.partialStreaming) {
        newMessages.push(sdkAssistantToAIMessage(message))
      }
      continue
    }

    if (message.type === 'user') {
      pushAguiFromMessage(message, aguiState, writer)
      newMessages.push(...sdkUserToToolMessages(message))
      continue
    }

    if (message.type === 'result') {
      if (message.subtype !== 'success') {
        const errText = message.errors?.join('\n') ?? message.subtype
        throw new Error(errText)
      }
      if (typeof message.session_id === 'string')
        sessionId = message.session_id
      break
    }
  }

  if (chunkBuffer) {
    const flushed = flushChunkBuffer(chunkBuffer)
    if (flushed)
      newMessages.push(flushed)
  }

  if (!sessionId)
    throw new Error('Claude SDK query finished without session_id')

  return { messages: newMessages, claudeSessionId: sessionId }
}
