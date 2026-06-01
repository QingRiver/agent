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
  const response = await fetch(SSE_URL, signal ? { signal } : undefined)

  if (!response.ok)
    throw new Error(`SSE request failed: ${response.status} ${response.statusText}`)

  const reader = response.body?.getReader()
  if (!reader)
    throw new Error('ReadableStream not supported')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      const line = frame
        .split('\n')
        .find(row => row.startsWith('data: '))

      if (!line)
        continue

      const payload = line.slice(6).trim()
      if (payload === '[DONE]')
        return

      onMessage(JSON.parse(payload) as SseMessage)
    }
  }
}
