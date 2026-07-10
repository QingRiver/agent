#!/usr/bin/env tsx
/**
 * hitl agent 端到端自测：登录 → 建 thread → 首轮 run → 4 次 resume → 校验完成
 * 需 server 已启动：pnpm dev
 */
import { randomUUID } from 'node:crypto'
import process from 'node:process'

const BASE_URL = process.env.BASE_URL ?? 'https://localhost:3000'
const DEV_ORIGIN = process.env.DEV_ORIGIN ?? 'https://localhost:5173'
const EMAIL = process.env.E2E_EMAIL ?? 'agent-e2e@cursor.local'
const PASSWORD = process.env.E2E_PASSWORD ?? 'agent-e2e-pass'
const USER_INPUT = process.env.HITL_INPUT ?? '向账户 0x123 转账 100 ETH'

/** 与 packages/graph/src/hitlGraph.test.ts 一致 */
const RESUME_BY_TYPE: Record<string, unknown> = {
  input: { value: '季度资金归集' },
  select: { value: 'high' },
  multiSelect: { values: ['audit', 'notify'] },
  approval: { approved: true },
}

interface PendingInterrupt {
  interruptId: string
  type: string
}

interface ThreadMessagesResponse {
  messages: Array<{ role?: string, content?: string }>
  threadState: { pendingInterrupt: PendingInterrupt | null }
}

function fail(msg: string): never {
  console.error(`\n[devops/e2e/hitl-agent] 错误: ${msg}`)
  process.exit(1)
}

async function fetchJson<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init
  const headers = new Headers(rest.headers)
  headers.set('Origin', DEV_ORIGIN)
  if (token)
    headers.set('Authorization', `Bearer ${token}`)
  if (rest.body && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json')

  const res = await fetch(`${BASE_URL}${path}`, { ...rest, headers })
  const text = await res.text()
  if (!res.ok)
    fail(`${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 500)}`)

  try {
    return JSON.parse(text) as T
  }
  catch {
    fail(`${path} 响应非 JSON: ${text.slice(0, 200)}`)
  }
}

async function signIn(): Promise<string> {
  console.log(`[devops/e2e/hitl-agent] sign-in ${EMAIL}`)
  const data = await fetchJson<{ token?: string }>('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!data.token)
    fail('登录响应缺少 token')
  return data.token
}

async function createThread(token: string): Promise<string> {
  console.log('[devops/e2e/hitl-agent] create hitl conversation')
  const data = await fetchJson<{ conversation: { id: string } }>('/conversations/create', {
    method: 'POST',
    token,
    body: JSON.stringify({ agentId: 'hitl' }),
  })
  if (!data.conversation?.id)
    fail('建会话响应缺少 conversation.id')
  return data.conversation.id
}

async function drainAgentRun(token: string, threadId: string, body: Record<string, unknown>): Promise<void> {
  const runId = randomUUID()
  const res = await fetch(`${BASE_URL}/copilotkit/agent/hitl/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Origin: DEV_ORIGIN,
    },
    body: JSON.stringify({ threadId, runId, tools: [], context: [], forwardedProps: {}, ...body }),
  })

  if (!res.ok) {
    const text = await res.text()
    fail(`agent run → ${res.status}: ${text.slice(0, 500)}`)
  }

  if (!res.body)
    fail('agent run 无响应体')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    buffer += decoder.decode(value, { stream: true })
  }

  for (const line of buffer.split('\n')) {
    if (!line.startsWith('data: '))
      continue
    try {
      const event = JSON.parse(line.slice(6)) as { type?: string, message?: string }
      if (event.type === 'RUN_ERROR')
        fail(`SSE RUN_ERROR: ${event.message ?? JSON.stringify(event)}`)
    }
    catch {
      // 忽略非 JSON data 行
    }
  }
}

async function getThreadState(token: string, threadId: string): Promise<ThreadMessagesResponse> {
  return fetchJson<ThreadMessagesResponse>(`/conversations/messages?id=${encodeURIComponent(threadId)}`, { token })
}

function resumePayload(type: string): unknown {
  const payload = RESUME_BY_TYPE[type]
  if (payload == null)
    fail(`未知 interrupt type: ${type}`)
  return payload
}

async function runInitial(token: string, threadId: string): Promise<void> {
  console.log(`[devops/e2e/hitl-agent] initial run: ${USER_INPUT}`)
  await drainAgentRun(token, threadId, {
    state: { input: USER_INPUT },
    messages: [{
      id: randomUUID(),
      role: 'user',
      content: USER_INPUT,
    }],
  })
}

async function runResume(
  token: string,
  threadId: string,
  interruptId: string,
  payload: unknown,
  label: string,
): Promise<void> {
  console.log(`[devops/e2e/hitl-agent] resume (${label}) interruptId=${interruptId}`)
  await drainAgentRun(token, threadId, {
    state: {},
    messages: [],
    resume: [{
      interruptId,
      status: 'resolved',
      payload,
    }],
  })
}

async function main(): Promise<void> {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

  const token = await signIn()
  const threadId = await createThread(token)
  console.log(`[devops/e2e/hitl-agent] thread=${threadId}`)

  await runInitial(token, threadId)

  const expectedTypes = ['input', 'select', 'multiSelect', 'approval']
  for (let step = 0; step < expectedTypes.length; step++) {
    const { threadState } = await getThreadState(token, threadId)
    const pending = threadState.pendingInterrupt
    if (!pending)
      fail(`第 ${step + 1} 步后期望挂起中断，但 pendingInterrupt 为空`)

    const expected = expectedTypes[step]
    if (pending.type !== expected) {
      fail(
        `第 ${step + 1} 步 interrupt type 期望 ${expected}，实际 ${pending.type}`,
      )
    }

    await runResume(token, threadId, pending.interruptId, resumePayload(pending.type), pending.type)
  }

  const final = await getThreadState(token, threadId)
  if (final.threadState.pendingInterrupt)
    fail('流程结束后仍有 pendingInterrupt')

  const assistant = [...final.messages].reverse().find(m => m.role === 'assistant')
  const content = typeof assistant?.content === 'string' ? assistant.content : ''
  if (!content.includes('已批准执行'))
    fail(`最终助手回复未包含「已批准执行」: ${content.slice(0, 200)}`)
  if (!content.includes('季度资金归集'))
    fail(`最终助手回复未包含用户目的: ${content.slice(0, 200)}`)

  console.log('\n[devops/e2e/hitl-agent] 通过 ✓')
  console.log(content.split('\n').slice(0, 4).join('\n'))
}

main().catch((error: unknown) => {
  console.error('[devops/e2e/hitl-agent] 失败:', error)
  process.exit(1)
})
