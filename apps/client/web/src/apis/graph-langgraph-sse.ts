import type { LangChainMessage, LangGraphCommand, LangGraphMessagesEvent } from '@assistant-ui/react-langgraph'
import type { GraphsName } from './api-types'
import { getStoredToken } from './auth-client'

export class GraphThreadForbiddenError extends Error {
  constructor() {
    super('对话不存在或无权访问')
    this.name = 'GraphThreadForbiddenError'
  }
}

export interface GraphLangGraphState {
  messages: LangChainMessage[]
  interrupts: Array<{ id: string, value: unknown }>
}

interface StreamGraphLangGraphOptions {
  graph: GraphsName
  threadId: string
  messages: readonly LangChainMessage[]
  command?: LangGraphCommand
  configurable?: Record<string, unknown>
  signal?: AbortSignal
  onCustom?: (data: unknown) => void
  onRunning?: (running: boolean) => void
}

function authedHeaders(json: boolean): Record<string, string> {
  const headers: Record<string, string> = {}
  if (json)
    headers['Content-Type'] = 'application/json'
  const token = getStoredToken()
  if (token)
    headers.Authorization = `Bearer ${token}`
  return headers
}

async function readError(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => '')
  if (!text)
    return fallback
  try {
    const body = JSON.parse(text) as { error?: string }
    if (typeof body.error === 'string' && body.error)
      return body.error
  }
  catch {
    // 非 JSON
  }
  return text
}

export async function fetchGraphLangGraphState(
  graph: GraphsName,
  threadId: string,
): Promise<GraphLangGraphState> {
  const params = new URLSearchParams({ threadId })
  const res = await fetch(`/api/graphs/${encodeURIComponent(graph)}/state?${params}`, {
    headers: authedHeaders(false),
  })
  if (res.status === 403)
    throw new GraphThreadForbiddenError()
  if (!res.ok)
    throw new Error(await readError(res, `graph state (${graph}) failed: ${res.status}`))
  return await res.json() as GraphLangGraphState
}

export async function* streamGraphLangGraph(
  opts: StreamGraphLangGraphOptions,
): AsyncGenerator<LangGraphMessagesEvent<LangChainMessage>> {
  opts.onRunning?.(true)
  try {
    yield* readGraphLangGraphStream(opts)
  }
  finally {
    opts.onRunning?.(false)
  }
}

async function* readGraphLangGraphStream(
  opts: StreamGraphLangGraphOptions,
): AsyncGenerator<LangGraphMessagesEvent<LangChainMessage>> {
  const res = await fetch(`/api/graphs/${encodeURIComponent(opts.graph)}/stream`, {
    method: 'POST',
    headers: {
      ...authedHeaders(true),
      Accept: 'text/event-stream',
    },
    signal: opts.signal,
    body: JSON.stringify({
      threadId: opts.threadId,
      messages: opts.messages,
      ...(opts.command ? { command: opts.command } : {}),
      ...(opts.configurable ? { configurable: opts.configurable } : {}),
    }),
  })

  if (res.status === 403)
    throw new GraphThreadForbiddenError()
  if (!res.ok)
    throw new Error(await readError(res, `graph stream (${opts.graph}) failed: ${res.status}`))
  if (!res.body)
    throw new Error(`graph stream (${opts.graph}): empty body`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const push = function* (block: string): Generator<LangGraphMessagesEvent<LangChainMessage>> {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data: '))
        continue
      const raw = line.slice(6).trim()
      if (!raw)
        continue
      try {
        const event = JSON.parse(raw) as { event?: string, data?: unknown }
        if (event.event === 'custom') {
          opts.onCustom?.(event.data)
          continue
        }
        yield event as LangGraphMessagesEvent<LangChainMessage>
      }
      catch {
        // 心跳 / 非 JSON
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    yield* push(lines.join('\n'))
  }

  if (buffer)
    yield* push(buffer)
}
