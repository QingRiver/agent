import { fail } from '../support/assert'
import { runHitlAgentE2E } from './hitl-agent'
import { runKbAgentE2E } from './kb-agent'

/**
 * Flow 注册表。
 *
 * 新增 agent flow：实现一个 `() => Promise<void>`（通过/失败以 exit code 表达），
 * 在此注册即可被 runner / devops 调用，无需改 skill。
 */
export type E2eFlowName = 'hitl-agent' | 'kb-agent'

export const FLOWS: Record<E2eFlowName, () => Promise<void>> = {
  'hitl-agent': runHitlAgentE2E,
  'kb-agent': runKbAgentE2E,
}

/** 按名称运行 flow；未知名称直接 fail 列出可用项。 */
export async function runFlow(name: string): Promise<void> {
  const flow = FLOWS[name as E2eFlowName]
  if (!flow) {
    const names = Object.keys(FLOWS).join(', ')
    fail(`未知 e2e flow: ${name}（可用: ${names}）`)
  }
  await flow()
}
