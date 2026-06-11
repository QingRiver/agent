/**
 * Vendored from @langchain/anthropic message_outputs.ts (v1.4.0).
 * @see https://github.com/langchain-ai/langchainjs/blob/main/libs/providers/langchain-anthropic/src/utils/message_outputs.ts
 */
import type { AIMessageChunkFields } from '@langchain/core/messages'
import type { ToolCallChunk } from '@langchain/core/messages/tool'
import type { SDKMessage } from '../sdk'
import { AIMessageChunk } from '@langchain/core/messages'

type ChunkFields = AIMessageChunkFields
function makeChunk(fields: Record<string, unknown>): AIMessageChunk {
  return new AIMessageChunk(fields as ChunkFields)
}

export type SdkStreamEvent = Extract<SDKMessage, { type: 'stream_event' }>['event']

export interface MakeChunkFields {
  streamUsage?: boolean
  coerceContentToString?: boolean
}

/** Anthropic `BetaRawMessageStreamEvent` → `AIMessageChunk`（与 LangChain ChatAnthropic 流式一致） */
export function makeMessageChunkFromAnthropicEvent(
  data: SdkStreamEvent,
  fields: MakeChunkFields = {},
): { chunk: AIMessageChunk } | null {
  const coerceContentToString = fields.coerceContentToString ?? false
  const response_metadata = { model_provider: 'anthropic' }

  if (data.type === 'message_start') {
    const { content: _content, usage, ...additionalKwargs } = data.message
    const filteredAdditionalKwargs: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(additionalKwargs)) {
      if (value !== undefined && value !== null)
        filteredAdditionalKwargs[key] = value
    }
    const { input_tokens: _in, output_tokens: _out, ...rest } = usage ?? {}
    return {
      chunk: makeChunk({
        content: coerceContentToString ? '' : [],
        additional_kwargs: filteredAdditionalKwargs,
        response_metadata: {
          ...response_metadata,
          usage: { ...rest },
        },
        id: data.message.id,
      }),
    }
  }

  if (data.type === 'message_delta') {
    return {
      chunk: makeChunk({
        content: coerceContentToString ? '' : [],
        ...('context_management' in data.delta
          ? { response_metadata: { context_management: data.delta.context_management } }
          : {}),
        additional_kwargs: { ...data.delta },
      }),
    }
  }

  if (data.type === 'content_block_start') {
    const block = data.content_block
    if (['tool_use', 'document', 'server_tool_use', 'web_search_tool_result'].includes(block.type)) {
      let toolCallChunks: ToolCallChunk[] = []
      if (block.type === 'tool_use') {
        toolCallChunks = [{
          id: block.id,
          index: data.index,
          name: block.name,
          args: '',
        }]
      }
      return {
        chunk: makeChunk({
          content: coerceContentToString
            ? ''
            : [{
                index: data.index,
                ...block,
                input: block.type === 'server_tool_use' || block.type === 'tool_use' ? '' : undefined,
              }] as ChunkFields['content'],
          response_metadata,
          additional_kwargs: {},
          tool_call_chunks: toolCallChunks,
        }),
      }
    }

    if (block.type === 'text' && block.text !== undefined) {
      return {
        chunk: makeChunk({
          content: coerceContentToString
            ? block.text
            : [{ index: data.index, ...block }] as ChunkFields['content'],
          response_metadata,
          additional_kwargs: {},
        }),
      }
    }

    if (block.type === 'thinking' || block.type === 'redacted_thinking') {
      return {
        chunk: makeChunk({
          content: coerceContentToString
            ? (block.type === 'thinking' ? block.thinking : '')
            : [{ index: data.index, ...block }] as ChunkFields['content'],
          response_metadata,
        }),
      }
    }
  }

  if (data.type === 'content_block_delta') {
    const delta = data.delta
    if (['text_delta', 'citations_delta', 'thinking_delta', 'signature_delta'].includes(delta.type)) {
      if (coerceContentToString && 'text' in delta && typeof delta.text === 'string') {
        return { chunk: makeChunk({ content: delta.text }) }
      }
      const contentBlock = { ...delta } as Record<string, unknown>
      if ('citation' in contentBlock) {
        contentBlock.citations = [contentBlock.citation]
        delete contentBlock.citation
      }
      const blockType = delta.type === 'thinking_delta' || delta.type === 'signature_delta'
        ? 'thinking'
        : 'text'
      return {
        chunk: makeChunk({
          content: [{ index: data.index, ...contentBlock, type: blockType }] as ChunkFields['content'],
          response_metadata,
        }),
      }
    }

    if (delta.type === 'input_json_delta') {
      return {
        chunk: makeChunk({
          content: coerceContentToString
            ? ''
            : [{
                index: data.index,
                input: delta.partial_json,
                type: delta.type,
              }] as ChunkFields['content'],
          response_metadata,
          additional_kwargs: {},
          tool_call_chunks: [{
            index: data.index,
            args: delta.partial_json,
          }],
        }),
      }
    }
  }

  return null
}

/** 将累积的 chunk 合并为 `AIMessage` */
export function chunkBufferToAIMessage(buffer: AIMessageChunk): AIMessageChunk {
  return buffer
}
