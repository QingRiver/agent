import { useAgent } from '@copilotkit/react-core/v2'
import { useConversations } from '@hooks/useConversations'

/** hitl 挂起：REST hydrate 或 CopilotKit agent.pendingInterrupts 任一为真 */
export function useHitlHasPendingInterrupt(): boolean {
  const { threadState } = useConversations()
  const { agent } = useAgent({ agentId: 'hitl' })
  return threadState?.pendingInterrupt != null || agent.pendingInterrupts.length > 0
}
