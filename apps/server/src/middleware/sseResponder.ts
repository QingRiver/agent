import type { Context, Next } from 'koa'
import type { SseStreamMeta } from '../utils/sse'
import { Readable } from 'node:stream'
import { createSseStream } from '../utils/sse'

function applySseHeaders(ctx: Context): void {
  ctx.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  ctx.status = 200
}

function isEventStream(body: unknown): body is AsyncIterable<unknown> {
  if (body == null || body instanceof Readable)
    return false
  return typeof (body as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function'
}

export async function sseResponder(ctx: Context, next: Next): Promise<void> {
  await next()

  const body = ctx.body
  if (!isEventStream(body))
    return

  const meta = (ctx.state as { sse?: SseStreamMeta }).sse

  applySseHeaders(ctx)
  ctx.body = createSseStream(body, meta)
}
