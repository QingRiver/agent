import process from 'node:process'
import { E2E_BASE_URL, e2eFetch, e2eHeaders } from '../client'
import { fail } from './assert'

/** POST /graphs/:name/stream 的可变请求体 */
export interface AgentRunBody {
  messages?: Array<{ type: 'human' | 'ai' | 'system' | 'tool', content: string }>
  configurable?: Record<string, unknown>
  command?: { resume: unknown }
}

interface WireEvent {
  event?: string
  data?: { message?: string }
  type?: string
  message?: string
  [key: string]: unknown
}

/**
 * 读尽 LangGraph SSE。`event: "error"` 即失败。
 */
export async function drainSse(
  res: Response,
  opts: { echo?: boolean } = {},
): Promise<void> {
  if (!res.body)
    fail('SSE 响应无 body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    const chunk = decoder.decode(value, { stream: true })
    if (opts.echo)
      process.stdout.write(chunk)
    buffer += chunk
  }

  for (const line of buffer.split('\n')) {
    if (!line.startsWith('data: '))
      continue
    let event: WireEvent
    try {
      event = JSON.parse(line.slice(6)) as WireEvent
    }
    catch {
      continue
    }
    if (event.event === 'error') {
      const message = event.data?.message ?? event.message ?? JSON.stringify(event)
      fail(`graph stream error: ${message}`)
    }
  }
}

export interface GraphStateSnapshot {
  messages: Array<{ type?: string, content?: unknown }>
  interrupts: Array<{ id: string, value?: unknown }>
}

/** 刷新用的 checkpoint：GET /graphs/{agent}/state。 */
export async function fetchGraphState(
  token: string,
  agent: string,
  threadId: string,
): Promise<GraphStateSnapshot> {
  const params = new URLSearchParams({ threadId })
  return e2eFetch<GraphStateSnapshot>(
    token,
    `/graphs/${encodeURIComponent(agent)}/state?${params}`,
  )
}

/** 直接跑图：POST /graphs/{agent}/stream，读尽 SSE。 */
export async function runAgentRun(
  token: string,
  agent: string,
  threadId: string,
  body: AgentRunBody,
  opts: { echo?: boolean } = {},
): Promise<void> {
  const res = await fetch(`${E2E_BASE_URL}/graphs/${agent}/stream`, {
    method: 'POST',
    headers: e2eHeaders(token, {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    }),
    body: JSON.stringify({
      threadId,
      messages: body.messages ?? [],
      ...(body.configurable ? { configurable: body.configurable } : {}),
      ...(body.command ? { command: body.command } : {}),
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    fail(`graph stream (${agent}) → ${res.status}: ${text.slice(0, 500)}`)
  }

  await drainSse(res, opts)
}
