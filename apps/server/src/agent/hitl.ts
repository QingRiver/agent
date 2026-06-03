import type { RunAgentInput } from '@ag-ui/core'
import { extractApprovalResume } from '../agui/extractApprovalResume'
import { LangGraphAguiAgent } from '../agui/LangGraphAguiAgent'
import { hitlGraphApp } from '../graphs/index'
import { buildHitlInput, formatHitlResult } from '../hitl/adapter'

function extractHitlInput(input: RunAgentInput): string {
  const state = input.state as { input?: string } | undefined
  if (state?.input?.trim())
    return state.input.trim()

  const lastUser = [...input.messages].reverse().find(m => m.role === 'user')
  if (lastUser && typeof lastUser.content === 'string' && lastUser.content.trim())
    return lastUser.content.trim()

  return '向账户 0x123... 转账 100 ETH'
}

export const hitlAgent = new LangGraphAguiAgent({
  agentId: 'hitl',
  description: 'LangGraph HITL：prepare → approval → execute',
  graph: hitlGraphApp,
  resolvePayload: input => buildHitlInput(extractHitlInput(input)),
  extractResume: extractApprovalResume,
  emitFinalSummary: true,
  formatSummary: values => formatHitlResult(values.result as Parameters<typeof formatHitlResult>[0]),
})
