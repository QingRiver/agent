import type { GraphsName } from '@apis/api-types'
import { useAgent, useCopilotKit } from '@copilotkit/react-core/v2'
import { narrowAgUiPendingInterrupt } from '@lib/interruptContracts'
import { runWithCleanup } from '@lib/runWithCleanup'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { InterruptCard } from './InterruptCards'
import { useAgentInterruptResume } from './useAgentInterruptResume'

interface AgentInterruptUiProps {
  agentId: GraphsName
}

/**
 * 任意 agent 的中断 UI（注入 CopilotChat）。
 * 单投影：只信 `agent.pendingInterrupts`（live run 或 CheckpointConnectRunner 重放写入）。
 * resume 必须带 interruptId（见 useAgentInterruptResume）。
 */
export function AgentInterruptUi({ agentId }: AgentInterruptUiProps) {
  const { copilotkit } = useCopilotKit()
  const { agent } = useAgent({ agentId })
  const [busy, setBusy] = useState(false)

  const resumeInterrupt = useAgentInterruptResume(agent)

  const pendingId = agent.pendingInterrupts[0]?.id
  const pendingMeta = agent.pendingInterrupts[0]?.metadata
  const request = useMemo(
    () => narrowAgUiPendingInterrupt(
      pendingId != null ? { id: pendingId, metadata: pendingMeta } : null,
    ),
    [pendingId, pendingMeta],
  )

  const onRespond = useCallback((payload: unknown) => {
    if (request == null)
      return
    setBusy(true)
    void runWithCleanup(
      () => resumeInterrupt(payload, request.interruptId),
      () => setBusy(false),
    )
  }, [request, resumeInterrupt])

  const element = useMemo(() => {
    if (request == null)
      return null
    return (
      <div className={busy ? 'pointer-events-none opacity-60' : undefined}>
        <InterruptCard
          request={request}
          onRespond={onRespond}
        />
      </div>
    )
  }, [busy, request, onRespond])

  useEffect(() => {
    copilotkit.setInterruptElement(element)
    return () => {
      copilotkit.setInterruptElement(null)
    }
  }, [element, copilotkit])

  return null
}
