import type { GraphsName } from '@apis/api-types'
import type { InterruptRequest } from '@lib/interruptContracts'
import { useAgent, useCopilotKit, useInterrupt } from '@copilotkit/react-core/v2'
import { useConversations } from '@hooks/useConversations'
import { narrowInterruptRequest, narrowPendingInterrupt } from '@lib/interruptContracts'
import { useCallback, useEffect, useState } from 'react'
import { InterruptCard } from './InterruptCards'
import { useAgentInterruptResume } from './useAgentInterruptResume'

interface AgentInterruptUiProps {
  agentId: GraphsName
  threadId: string
}

/**
 * 任意 agent 的中断 UI（注入 CopilotChat）。
 * - 进行中 run：useInterrupt 订阅 on_interrupt
 * - 刷新后：threadState.pendingInterrupt 来自 checkpoint hydrate
 * resume 必须带 interruptId（见 useAgentInterruptResume）。
 */
export function AgentInterruptUi({ agentId, threadId }: AgentInterruptUiProps) {
  const { threadState, reloadActiveThread } = useConversations()
  const { copilotkit } = useCopilotKit()
  const { agent } = useAgent({ agentId })
  const [busy, setBusy] = useState(false)

  const resumeInterrupt = useAgentInterruptResume(agent, threadId, reloadActiveThread)

  const respond = useCallback(async (payload: unknown, interruptId?: string) => {
    setBusy(true)
    try {
      await resumeInterrupt(payload, interruptId)
    }
    finally {
      setBusy(false)
    }
  }, [resumeInterrupt])

  const liveElement = useInterrupt({
    agentId,
    renderInChat: false,
    enabled: event => event.name === 'on_interrupt',
    render: ({ event }) => {
      const request = narrowInterruptRequest(event.value)
      if (!request)
        return <></>

      const interruptId = agent.pendingInterrupts[0]?.id
      return (
        <InterruptCard
          request={request}
          onRespond={payload => void respond(payload, interruptId)}
        />
      )
    },
  })

  const pending = threadState?.pendingInterrupt
  const pendingRequest: InterruptRequest | null = pending != null
    ? narrowPendingInterrupt(pending)
    : null
  const checkpointElement = pendingRequest != null
    ? (
        <div className={busy ? 'pointer-events-none opacity-60' : undefined}>
          <InterruptCard
            request={pendingRequest}
            onRespond={payload => void respond(payload, pendingRequest.interruptId)}
          />
        </div>
      )
    : null

  const element = liveElement ?? checkpointElement

  useEffect(() => {
    copilotkit.setInterruptElement(element)
    return () => {
      copilotkit.setInterruptElement(null)
    }
  }, [element, copilotkit])

  return null
}

/** @deprecated 使用 AgentInterruptUi */
export const HitlInterruptUi = AgentInterruptUi
