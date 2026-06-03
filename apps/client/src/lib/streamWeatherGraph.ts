import type { SseMessage } from './sseMessage'
import { fetchEventSource } from '@microsoft/fetch-event-source'

export type { SseMessage } from './sseMessage'

export interface StreamWeatherGraphOptions {
  message: string
  onMessage: (message: SseMessage) => void
  signal?: AbortSignal
}

export async function streamWeatherGraph({
  message,
  onMessage,
  signal,
}: StreamWeatherGraphOptions): Promise<void> {
  const url = `/api/sample/weather?message=${encodeURIComponent(message)}`
  await fetchEventSource(url, {
    ...(signal ? { signal } : {}),
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
