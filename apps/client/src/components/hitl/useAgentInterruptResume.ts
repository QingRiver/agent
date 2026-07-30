import { useCallback } from 'react'

interface AgentResumeAgent {
  pendingInterrupts: Array<{ id: string }>
  runAgent: (input: {
    resume: Array<{ interruptId: string, status: 'resolved', payload: unknown }>
  }) => Promise<unknown>
}

/**
 * HITL resume：只走 AG-UI `RunAgentInput.resume[]`（须含 interruptId）。
 * threadId 由外层 CopilotChatConfigurationProvider(hasExplicitThreadId) 经 useAgent 同步。
 */
export function useAgentInterruptResume(agent: AgentResumeAgent) {
  return useCallback(async (payload: unknown, interruptId?: string) => {
    const id = interruptId ?? agent.pendingInterrupts[0]?.id
    if (!id)
      throw new Error('Agent interrupt resume: missing interruptId')

    await agent.runAgent({
      resume: [{
        interruptId: id,
        status: 'resolved',
        payload,
      }],
    })
  }, [agent])
}
