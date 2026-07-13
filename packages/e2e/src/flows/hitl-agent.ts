import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { e2eFetch, signInE2E } from '../client'
import { createThread, fail, runAgentRun } from '../support'

/**
 * hitl agent 端到端 flow：登录 → 建 thread → 首轮 run → 4 次 interrupt+resume → 校验完成。
 *
 * 场景与 `packages/graph/src/hitlGraph.test.ts` 对齐：固定 4 步中断序列
 * （input → select → multiSelect → approval），每步用预设 payload resume，
 * 最终断言助手回复含「已批准执行」与用户原始意图。
 *
 * 前置：`pnpm dev` 已启动 server，且 `pnpm devops e2e auth` 已写入 E2E 账号。
 */

const USER_INPUT = process.env.HITL_INPUT ?? '向账户 0x123 转账 100 ETH'

/** 4 步中断类型与对应 resume payload（与 hitlGraph.test.ts 一致） */
const RESUME_BY_TYPE: Record<string, unknown> = {
  input: { value: '季度资金归集' },
  select: { value: 'high' },
  multiSelect: { values: ['audit', 'notify'] },
  approval: { approved: true },
}
const EXPECTED_TYPES = ['input', 'select', 'multiSelect', 'approval'] as const

/** GET /conversations/messages 的响应子集（仅取 flow 关心的字段） */
interface ThreadStateResponse {
  messages: Array<{ role?: string, content?: string }>
  threadState: { pendingInterrupt: { interruptId: string, type: string } | null }
}

/** 取 thread 当前状态（消息 + 待处理中断） */
async function getThreadState(token: string, threadId: string): Promise<ThreadStateResponse> {
  return e2eFetch<ThreadStateResponse>(
    token,
    `/conversations/messages?id=${encodeURIComponent(threadId)}`,
  )
}

export async function runHitlAgentE2E(): Promise<void> {
  const token = await signInE2E()
  const threadId = await createThread(token, 'hitl')
  console.log(`[e2e/hitl-agent] thread=${threadId}`)

  // 首轮：喂入用户意图，触发首个中断
  await runAgentRun(token, 'hitl', threadId, {
    state: { input: USER_INPUT },
    messages: [{ id: randomUUID(), role: 'user', content: USER_INPUT }],
  })
  console.log('[e2e/hitl-agent] initial run done')

  // 4 步 interrupt + resume
  for (const [step, expected] of EXPECTED_TYPES.entries()) {
    const { threadState } = await getThreadState(token, threadId)
    const pending = threadState.pendingInterrupt
    if (!pending)
      fail(`第 ${step + 1} 步后期望挂起中断，但 pendingInterrupt 为空`)
    if (pending.type !== expected)
      fail(`第 ${step + 1} 步 interrupt type 期望 ${expected}，实际 ${pending.type}`)

    const payload = RESUME_BY_TYPE[pending.type] ?? fail(`未知 interrupt type: ${pending.type}`)
    await runAgentRun(token, 'hitl', threadId, {
      resume: [{ interruptId: pending.interruptId, status: 'resolved', payload }],
    })
    console.log(`[e2e/hitl-agent] resume (${pending.type}) done`)
  }

  // 收尾：无遗留中断 + 最终回复含批准与意图
  const final = await getThreadState(token, threadId)
  if (final.threadState.pendingInterrupt)
    fail('流程结束后仍有 pendingInterrupt')

  const assistant = [...final.messages].reverse().find(m => m.role === 'assistant')
  const content = typeof assistant?.content === 'string' ? assistant.content : ''
  if (!content.includes('已批准执行'))
    fail(`最终助手回复未包含「已批准执行」: ${content.slice(0, 200)}`)
  if (!content.includes('季度资金归集'))
    fail(`最终助手回复未包含用户目的: ${content.slice(0, 200)}`)

  console.log('\n[e2e/hitl-agent] 通过 ✓')
  console.log(content.split('\n').slice(0, 4).join('\n'))
}
