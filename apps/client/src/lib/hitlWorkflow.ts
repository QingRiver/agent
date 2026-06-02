import { fetchEventSource } from '@microsoft/fetch-event-source'

export interface HitlSseEvent {
  type: string
  threadId?: string
  data?: unknown
  message?: string
}

export interface ApprovalDecision {
  approved: boolean
  reason?: string
}

interface StreamHitlSseOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
}

async function streamHitlSse(
  url: string,
  onEvent: (event: HitlSseEvent) => void,
  options: StreamHitlSseOptions = {},
): Promise<void> {
  const { method, headers, body, signal } = options
  await fetchEventSource(url, {
    method,
    headers,
    body,
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
      onEvent(JSON.parse(ev.data) as HitlSseEvent)
    },
    onerror(err) {
      throw err
    },
  })
}

export async function startHitlWorkflow(
  input: string,
  onEvent: (event: HitlSseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const url = `/api/hitl/workflow/sse?input=${encodeURIComponent(input)}`
  await streamHitlSse(url, onEvent, { signal })
}

export async function resumeHitlWorkflow(
  threadId: string,
  decision: ApprovalDecision,
  onEvent: (event: HitlSseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  await streamHitlSse(`/api/hitl/workflow/${threadId}/resume`, onEvent, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(decision),
    signal,
  })
}
