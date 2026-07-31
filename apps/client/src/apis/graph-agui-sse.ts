import type { GraphsName } from './api-types'
import { getStoredToken } from './auth-client'

export interface GraphAguiSseEvent {
  type?: string
  delta?: string
  name?: string
  value?: unknown
  message?: string
  code?: string
  [key: string]: unknown
}

export interface RunGraphAguiSseOptions {
  /** 图名，对应 `Graphs` / `POST /api/graphs/:name/run` */
  graph: GraphsName
  threadId: string
  state?: Record<string, unknown>
  forwardedProps?: Record<string, unknown>
  messages?: Array<{ id: string, role: 'user' | 'assistant' | 'system', content: string }>
  runId?: string
  signal?: AbortSignal
  onEvent: (event: GraphAguiSseEvent) => void
}

/**
 * 薄 AG-UI SSE：POST /api/graphs/:name/run，边收边回调。
 * 旁路 CopilotKit Runtime；与具体业务图解耦。
 */
export async function runGraphAguiSse(opts: RunGraphAguiSseOptions): Promise<void> {
  const token = getStoredToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  }
  if (token)
    headers.Authorization = `Bearer ${token}`

  const res = await fetch(`/api/graphs/${encodeURIComponent(opts.graph)}/run`, {
    method: 'POST',
    headers,
    signal: opts.signal,
    body: JSON.stringify({
      threadId: opts.threadId,
      ...(opts.runId ? { runId: opts.runId } : {}),
      state: opts.state ?? {},
      forwardedProps: opts.forwardedProps ?? {},
      messages: opts.messages ?? [],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `graph SSE (${opts.graph}) failed: ${res.status}`)
  }
  if (!res.body)
    throw new Error(`graph SSE (${opts.graph}): empty body`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: '))
        continue
      const raw = line.slice(6).trim()
      if (!raw)
        continue
      try {
        opts.onEvent(JSON.parse(raw) as GraphAguiSseEvent)
      }
      catch {
        // 心跳 / 非 JSON
      }
    }
  }

  if (buffer.startsWith('data: ')) {
    try {
      opts.onEvent(JSON.parse(buffer.slice(6).trim()) as GraphAguiSseEvent)
    }
    catch {
      // ignore
    }
  }
}
