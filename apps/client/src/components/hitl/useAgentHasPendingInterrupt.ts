import type { GraphsName } from '@apis/api-types'
import { useAgent } from '@copilotkit/react-core/v2'

/** 当前 agent 挂起：仅信 CopilotKit `agent.pendingInterrupts`（connect / live AG-UI 投影） */
export function useAgentHasPendingInterrupt(agentId: GraphsName): boolean {
  const { agent } = useAgent({ agentId })
  return agent.pendingInterrupts.length > 0
}
