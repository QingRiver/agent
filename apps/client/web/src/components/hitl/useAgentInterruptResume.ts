import { useCallback } from 'react'

interface AgentResumeAgent {
  pendingInterrupts: Array<{ id: string }>
  runAgent: (input: {
    resume: Array<{ interruptId: string, status: 'resolved', payload: unknown }>
    forwardedProps?: Record<string, unknown>
  }) => Promise<unknown>
}

/**
 * HITL resume：只走 AG-UI `RunAgentInput.resume[]`（须含 interruptId）。
 * 会话配置（如 kbId）经 forwardedProps 本轮带上，与提交/重试同一真相源。
 */
export function useAgentInterruptResume(
  agent: AgentResumeAgent,
  forwardedProps?: Record<string, unknown>,
) {
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
      ...(forwardedProps ? { forwardedProps } : {}),
    })
  }, [agent, forwardedProps])
}
