import type { InterruptRequest } from '@lib/hitlContracts'
import { useAgent, useCopilotKit, useInterrupt } from '@copilotkit/react-core/v2'
import { useConversations } from '@hooks/useConversations'
import { narrowInterruptRequest, narrowPendingInterrupt } from '@lib/hitlContracts'
import { useCallback, useEffect, useState } from 'react'
import { InterruptCard } from './InterruptCards'
import { useHitlResume } from './useHitlResume'

interface HitlInterruptUiProps {
  threadId: string
}

/**
 * 中断 UI 注入 CopilotChat 消息流（与 useInterrupt 默认 renderInChat 同位置）。
 * - 进行中 run：useInterrupt 订阅 on_interrupt
 * - 刷新后：threadState.pendingInterrupt 来自 checkpoint hydrate
 * resume 必须带 interruptId（见 useHitlResume），不能用 useInterrupt 内置 resolve。
 */
export function HitlInterruptUi({ threadId }: HitlInterruptUiProps) {
  const { threadState, reloadActiveThread } = useConversations()
  const { copilotkit } = useCopilotKit()
  const { agent } = useAgent({ agentId: 'hitl' })
  const [busy, setBusy] = useState(false)

  const resumeHitl = useHitlResume(agent, threadId, reloadActiveThread)

  const respond = useCallback(async (payload: unknown, interruptId?: string) => {
    setBusy(true)
    try {
      await resumeHitl(payload, interruptId)
    }
    finally {
      setBusy(false)
    }
  }, [resumeHitl])

  const liveElement = useInterrupt({
    agentId: 'hitl',
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
