import type { SseMessage } from './sseMessage'
import { fetchEventSource } from '@microsoft/fetch-event-source'

export type { SseMessage } from './sseMessage'

export interface StreamSampleSseOptions {
  path: string
  query?: Record<string, string>
  onMessage: (message: SseMessage) => void
  signal?: AbortSignal
}

function buildUrl(path: string, query?: Record<string, string>): string {
  if (!query || Object.keys(query).length === 0)
    return path
  const params = new URLSearchParams(query)
  return `${path}?${params}`
}

export async function streamSampleSse({
  path,
  query,
  onMessage,
  signal,
}: StreamSampleSseOptions): Promise<void> {
  await fetchEventSource(buildUrl(path, query), {
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

export function streamSimpleGraph(
  options: Omit<StreamSampleSseOptions, 'path' | 'query'>,
): Promise<void> {
  return streamSampleSse({ ...options, path: '/api/sample/simpleGraph/sse' })
}

export function streamWeatherGraph(
  options: Omit<StreamSampleSseOptions, 'path'> & { message: string },
): Promise<void> {
  const { message, ...rest } = options
  return streamSampleSse({
    ...rest,
    path: '/api/sample/weather',
    query: { message },
  })
}
