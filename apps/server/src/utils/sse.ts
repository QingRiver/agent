import { Readable } from 'node:stream'
import { z } from 'zod'

const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
}

export interface SseStreamMeta {
  /** 合并进首个 `{ type: 'start' }` 事件 */
  start?: Record<string, unknown>
  /** 合并进收尾 `{ type: 'done' }` 事件（在 `[DONE]` 之前） */
  done?: Record<string, unknown>
}

export function sseEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

export function formatSseError(err: unknown): string {
  if (err instanceof z.ZodError)
    return err.issues.map(issue => issue.message).join('; ')
  if (err instanceof Error)
    return err.message
  return String(err)
}

/** 已是 `{ type: string, ... }` 则原样输出，否则包成 update（适配 LangGraph stream 等原始 chunk） */
function normalizeChunk(chunk: unknown): unknown {
  if (
    chunk != null
    && typeof chunk === 'object'
    && 'type' in chunk
    && typeof (chunk as { type: unknown }).type === 'string'
  ) {
    return chunk
  }
  return { type: 'update', data: chunk }
}

/**
 * 包装业务事件流：统一发出 start → 业务事件 → done → `[DONE]`
 * 可传入 LangGraph stream（原始 update）或自定义 `{ type }` 事件流
 */
export function createSseStream(
  events: AsyncIterable<unknown>,
  meta: SseStreamMeta = {},
): Readable {
  async function* encode() {
    yield sseEvent({ type: 'start', ...meta.start })

    try {
      for await (const chunk of events)
        yield sseEvent(normalizeChunk(chunk))

      yield sseEvent({ type: 'done', ...meta.done })
    }
    catch (err) {
      yield sseEvent({
        type: 'error',
        message: formatSseError(err),
      })
      yield sseEvent({ type: 'done', ...meta.done })
    }
    finally {
      yield 'data: [DONE]\n\n'
    }
  }

  return Readable.from(encode())
}

/** 将 AsyncIterable 业务事件流转为 Hono/Fetch `Response`（SSE） */
export function createSseResponse(
  events: AsyncIterable<unknown>,
  meta: SseStreamMeta = {},
): Response {
  const body = Readable.toWeb(createSseStream(events, meta)) as ReadableStream<Uint8Array>
  return new Response(body, { status: 200, headers: SSE_HEADERS })
}
