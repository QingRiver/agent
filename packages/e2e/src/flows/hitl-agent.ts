import process from 'node:process'
import { signInE2E } from '../client'
import { createThread, fail, fetchGraphState, runAgentRun } from '../support'

/**
 * dev agent HITL 审批演示端到端：登录 → 建 thread → 澄清选 hitlDemo → 4 次 interrupt+resume。
 *
 * 与 `packages/graph/src/graphs/dev.test.ts` 对齐。
 *
 * 前置：`pnpm dev` 已启动 server，且 `pnpm devops e2e auth` 已写入 E2E 账号。
 */

const USER_INPUT = process.env.HITL_INPUT ?? '向账户 0x123 转账 100 ETH'

/** 澄清之后的 4 步中断类型与 resume payload */
const RESUME_BY_TYPE: Record<string, unknown> = {
  input: { value: '季度资金归集' },
  select: { value: 'high' },
  multiSelect: { values: ['audit', 'notify'] },
  approval: { approved: true },
}
const EXPECTED_TYPES = ['input', 'select', 'multiSelect', 'approval'] as const

function interruptType(value: unknown): string | undefined {
  if (value == null || typeof value !== 'object' || !('type' in value))
    return undefined
  const type = (value as { type?: unknown }).type
  return typeof type === 'string' ? type : undefined
}

function messageText(content: unknown): string {
  if (typeof content === 'string')
    return content
  if (!Array.isArray(content))
    return ''
  return content.map((block) => {
    if (typeof block === 'string')
      return block
    if (block != null && typeof block === 'object' && 'text' in block)
      return String((block as { text?: unknown }).text ?? '')
    return ''
  }).join('')
}

async function pendingInterruptType(token: string, threadId: string): Promise<string | undefined> {
  const state = await fetchGraphState(token, 'dev', threadId)
  return interruptType(state.interrupts[0]?.value)
}

export async function runHitlAgentE2E(): Promise<void> {
  const token = await signInE2E()
  const threadId = await createThread(token, 'dev')
  console.log(`[e2e/hitl-agent] thread=${threadId} agent=dev`)

  await runAgentRun(token, 'dev', threadId, {
    messages: [{ type: 'human', content: USER_INPUT }],
  })
  console.log('[e2e/hitl-agent] initial run done')

  // 澄清 select → hitlDemo
  {
    const pending = await pendingInterruptType(token, threadId)
    if (!pending)
      fail('期望澄清 select 中断，但 checkpoint interrupts 为空')
    if (pending !== 'select')
      fail(`澄清 interrupt type 期望 select，实际 ${pending}`)
    await runAgentRun(token, 'dev', threadId, {
      command: { resume: { value: 'hitlDemo' } },
    })
    console.log('[e2e/hitl-agent] resume (clarify→hitlDemo) done')
  }

  for (const [step, expected] of EXPECTED_TYPES.entries()) {
    const pending = await pendingInterruptType(token, threadId)
    if (!pending)
      fail(`第 ${step + 1} 步后期望挂起中断，但 checkpoint interrupts 为空`)
    if (pending !== expected)
      fail(`第 ${step + 1} 步 interrupt type 期望 ${expected}，实际 ${pending}`)

    const payload = RESUME_BY_TYPE[pending] ?? fail(`未知 interrupt type: ${pending}`)
    await runAgentRun(token, 'dev', threadId, {
      command: { resume: payload },
    })
    console.log(`[e2e/hitl-agent] resume (${pending}) done`)
  }

  const final = await fetchGraphState(token, 'dev', threadId)
  if (final.interrupts.length > 0)
    fail('流程结束后 checkpoint 仍有 interrupt')

  const assistant = [...final.messages].reverse().find(m => m.type === 'ai')
  const content = messageText(assistant?.content)
  if (!content.includes('已批准执行'))
    fail(`最终助手回复未包含「已批准执行」: ${content.slice(0, 200)}`)
  if (!content.includes('季度资金归集'))
    fail(`最终助手回复未包含用户目的: ${content.slice(0, 200)}`)

  console.log('\n[e2e/hitl-agent] 通过 ✓')
  console.log(content.split('\n').slice(0, 4).join('\n'))
}
