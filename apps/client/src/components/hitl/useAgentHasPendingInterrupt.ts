import type { GraphsName } from '@apis/api-types'
import { useAgent } from '@copilotkit/react-core/v2'
import { useConversations } from '@hooks/useConversations'

/** 当前 agent 挂起：REST hydrate 或 CopilotKit agent.pendingInterrupts 任一为真 */
export function useAgentHasPendingInterrupt(agentId: GraphsName): boolean {
  const { threadState } = useConversations()
  const { agent } = useAgent({ agentId })
  return threadState?.pendingInterrupt != null || agent.pendingInterrupts.length > 0
}

/** @deprecated 使用 useAgentHasPendingInterrupt */
export const useHitlHasPendingInterrupt = useAgentHasPendingInterrupt
