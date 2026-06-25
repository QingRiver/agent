import type { InterruptRequest } from '@lib/hitlContracts'
import { useAgent, useCopilotKit, useInterrupt } from '@copilotkit/react-core/v2'
import { useConversations } from '@hooks/useConversations'
import { narrowInterruptRequest, narrowPendingInterrupt } from '@lib/hitlContracts'
import { useCallback, useEffect, useState } from 'react'
import { InterruptCard } from './InterruptCards'

interface HitlInterruptUiProps {
  threadId: string
}

/**
 * 中断 UI 注入 CopilotChat 消息流（与 useInterrupt 默认 renderInChat 同位置）。
 * - 进行中 run：useInterrupt 订阅 on_interrupt,event.value 经 narrowInterruptRequest 收窄
 * - 刷新后：threadState.pendingInterrupt 来自 checkpoint hydrate
 * 两路都按 InterruptRequest.type 分发到 InterruptCard,resolve/resume payload 由 type 决定。
 */
export function HitlInterruptUi({ threadId }: HitlInterruptUiProps) {
  const { threadState, reloadActiveThread } = useConversations()
  const { copilotkit } = useCopilotKit()
  const { agent } = useAgent({ agentId: 'hitl' })
  const [busy, setBusy] = useState(false)

  const liveElement = useInterrupt({
    agentId: 'hitl',
    renderInChat: false,
    enabled: event => event.name === 'on_interrupt',
    render: ({ event, resolve }) => {
      const request = narrowInterruptRequest(event.value)
      if (!request)
        return <></>

      return <InterruptCard request={request} onRespond={payload => resolve(payload)} />
    },
  })

  const resumeFromCheckpoint = useCallback(async (payload: unknown) => {
    setBusy(true)
    try {
      agent.threadId = threadId
      await agent.runAgent({
        forwardedProps: {
          command: { resume: payload },
        },
      })
      await reloadActiveThread()
    }
    finally {
      setBusy(false)
    }
  }, [agent, threadId, reloadActiveThread])

  const pending = threadState?.pendingInterrupt
  const pendingRequest: InterruptRequest | null = pending != null
    ? narrowPendingInterrupt(pending)
    : null
  const checkpointElement = pendingRequest != null
    ? (
        <div className={busy ? 'pointer-events-none opacity-60' : undefined}>
          <InterruptCard request={pendingRequest} onRespond={payload => void resumeFromCheckpoint(payload)} />
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
