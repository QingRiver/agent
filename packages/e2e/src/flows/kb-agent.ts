import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { signInE2E } from '../client'
import { createThread, runAgentRun } from '../support'

/**
 * kb agent 端到端 flow：登录 → 建 thread → 跑知识库 RAG agent，SSE 原始流回显 stdout。
 *
 * 与 hitl flow 不同：无多轮 interrupt，单轮 RAG；`echo: true` 把 SSE 写 stdout
 * 供人观察引用/召回过程。RUN_ERROR 仍由 runAgentRun 统一兜底。
 *
 * 前置：`pnpm dev` + `pnpm devops infra up kb` + `pnpm devops e2e seed`（kb 种子数据）。
 */

const KB_ID = process.env.KB_ID ?? 'kb_default'
const QUESTION = process.env.QUESTION ?? '怎么开电子发票'

export async function runKbAgentE2E(): Promise<void> {
  const token = await signInE2E()
  console.log(`[e2e/kb-agent] kbId=${KB_ID}`)
  const threadId = await createThread(token, 'kb')
  console.log(`[e2e/kb-agent] thread=${threadId} question: ${QUESTION}`)
  console.log('--- SSE ---')

  await runAgentRun(
    token,
    'kb',
    threadId,
    {
      state: { kbId: KB_ID },
      messages: [{ id: randomUUID(), role: 'user', content: QUESTION }],
    },
    { echo: true },
  )

  console.log('\n--- done ---')
}
