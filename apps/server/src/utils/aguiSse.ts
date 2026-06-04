import type { BaseEvent } from '@ag-ui/core'
import type { Context } from 'hono'
import type { Observable } from 'rxjs'

export const AGUI_SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
}

function encodeAguiFrame(event: BaseEvent): string {
  return `event: agent_event\ndata: ${JSON.stringify(event)}\n\n`
}

export function respondWithAguiObservableStream(
  c: Context,
  eventStream$: Observable<BaseEvent>,
): Response {
  const encoder = new TextEncoder()

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const subscription = eventStream$.subscribe({
        next: (event) => {
          controller.enqueue(encoder.encode(encodeAguiFrame(event)))
        },
        error: (err) => {
          console.error('[SSE Stream Error]:', err)
          controller.close()
        },
        complete: () => {
          controller.close()
        },
      })

      const onAbort = () => {
        subscription.unsubscribe()
        try {
          controller.close()
        }
        catch {
          // already closed
        }
      }

      c.req.raw.signal.addEventListener('abort', onAbort, { once: true })
    },
  })

  return new Response(body, { status: 200, headers: AGUI_SSE_HEADERS })
}

export function createAguiSseResponse(
  events: AsyncIterable<BaseEvent>,
  signal?: AbortSignal,
): Response {
  const encoder = new TextEncoder()

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let aborted = false
      const onAbort = () => {
        aborted = true
        try {
          controller.close()
        }
        catch {
          // already closed
        }
      }
      signal?.addEventListener('abort', onAbort, { once: true })

      try {
        for await (const event of events) {
          if (aborted)
            break
          controller.enqueue(encoder.encode(encodeAguiFrame(event)))
        }
        if (!aborted)
          controller.close()
      }
      catch (err) {
        console.error('[SSE Stream Error]:', err)
        try {
          controller.close()
        }
        catch {
          // already closed
        }
      }
      finally {
        signal?.removeEventListener('abort', onAbort)
      }
    },
  })

  return new Response(body, { status: 200, headers: AGUI_SSE_HEADERS })
}
