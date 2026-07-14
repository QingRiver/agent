import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { E2E_BASE_URL, e2eHeaders } from '../client'
import { fail } from './assert'

/** /copilotkit/agent/{agent}/run 的可变请求体（threadId/runId 等由 runAgentRun 注入） */
export interface AgentRunBody {
  state?: Record<string, unknown>
  messages?: Array<{ id: string, role: string, content: string }>
  resume?: Array<{ interruptId: string, status: string, payload: unknown }>
}

/** SSE 单事件（按需取字段；AG-UI 事件类型繁多，不逐一建模） */
export interface SseEvent {
  type?: string
  message?: string
  [key: string]: unknown
}

/**
 * 读尽一个 SSE 响应体。
 *
 * - 逐行解析 `data: <json>` 为事件，回调 `onEvent`（用于 flow 自定义断言）。
 * - `echo: true` 时把原始 chunk 写 stdout（人读流式输出，如 kb agent）。
 * - 收到 `RUN_ERROR` 事件即 fail（AG-UI 终态，不应继续）。
 *
 * 抽出此函数前，hitl/kb 两个 flow 各自重写了「读流 + 找 RUN_ERROR」的同一段逻辑。
 */
export async function drainSse(
  res: Response,
  opts: { onEvent?: (event: SseEvent) => void, echo?: boolean } = {},
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

  // 流结束后再统一解析（简单可靠；e2e 无需逐事件实时回调）
  for (const line of buffer.split('\n')) {
    if (!line.startsWith('data: '))
      continue
    let event: SseEvent
    try {
      event = JSON.parse(line.slice(6)) as SseEvent
    }
    catch {
      // 非 JSON data 行（部分实现的心跳/注释），忽略
      continue
    }
    opts.onEvent?.(event)
    if (event.type === 'RUN_ERROR')
      fail(`SSE RUN_ERROR [${event.code ?? 'UNKNOWN'}]: ${event.message ?? JSON.stringify(event)}${event.json ? `\n${event.json}` : ''}`)
  }
}

/**
 * 发起一次 agent SSE run 并读尽。
 *
 * 统一封装所有 agent flow 的「POST /copilotkit/agent/{agent}/run + 读流 + RUN_ERROR 检测」。
 * - hitl flow：多轮调用（initial + 4 次 resume），不 echo，靠 RUN_ERROR 兜底。
 * - kb flow：单轮，echo 流式回显供人观察。
 *
 * 参数：token（signInE2E 取得）、agent（server GraphsName）、threadId（createThread 取得）、
 * body（可变部分 state/messages/resume）、opts.echo（是否写原始 SSE 到 stdout）。
 */
export async function runAgentRun(
  token: string,
  agent: string,
  threadId: string,
  body: AgentRunBody,
  opts: { echo?: boolean } = {},
): Promise<void> {
  const runId = randomUUID()
  const res = await fetch(`${E2E_BASE_URL}/copilotkit/agent/${agent}/run`, {
    method: 'POST',
    headers: e2eHeaders(token, {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    }),
    body: JSON.stringify({
      threadId,
      runId,
      tools: [],
      context: [],
      forwardedProps: {},
      ...body,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    fail(`agent run (${agent}) → ${res.status}: ${text.slice(0, 500)}`)
  }

  await drainSse(res, opts)
}
