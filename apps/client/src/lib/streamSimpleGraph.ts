import { fetchEventSource } from '@microsoft/fetch-event-source'

export interface SseMessage {
  type: 'start' | 'update' | 'done' | 'error'
  data?: Record<string, unknown>
  message?: string
}

export interface StreamSimpleGraphOptions {
  onMessage: (message: SseMessage) => void
  signal?: AbortSignal
}

const SSE_URL = '/api/sample/simpleGraph/sse'

export async function streamSimpleGraph({
  onMessage,
  signal,
}: StreamSimpleGraphOptions): Promise<void> {
  await fetchEventSource(SSE_URL, {
    signal,
    async onopen(response) {
      const contentType = response.headers.get('content-type') ?? ''
      if (response.ok && contentType.includes('text/event-stream'))
        return
      throw new Error(`SSE request failed: ${response.status} ${response.statusText}`)
    },
    onmessage(ev) {
      if (ev.data === '[DONE]')
        return
      onMessage(JSON.parse(ev.data) as SseMessage)
    },
    onerror(err) {
      throw err
    },
  })
}
