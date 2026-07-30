interface AgentResumeAgent {
  threadId: string
  pendingInterrupts: Array<{ id: string }>
  runAgent: (input: {
    resume: Array<{ interruptId: string, status: 'resolved', payload: unknown }>
  }) => Promise<unknown>
}

/**
 * AG-UI 要求 resume 走 `RunAgentInput.resume[]`（含 interruptId）。
 * CopilotKit `useInterrupt().resolve()` 仅写 forwardedProps.command.resume，无法通过 onInitialize 校验。
 */
export function useAgentInterruptResume(
  agent: AgentResumeAgent,
  threadId: string,
  onAfterResume?: () => Promise<void>,
) {
  return async (payload: unknown, interruptId?: string) => {
    const id = interruptId ?? agent.pendingInterrupts[0]?.id
    if (!id)
      throw new Error('Agent interrupt resume: missing interruptId')

    // AG-UI 将 threadId 设计为可变运行上下文，且 runAgent 参数不接受 threadId。
    agent.threadId = threadId
    await agent.runAgent({
      resume: [{
        interruptId: id,
        status: 'resolved',
        payload,
      }],
    })
    await onAfterResume?.()
  }
}
