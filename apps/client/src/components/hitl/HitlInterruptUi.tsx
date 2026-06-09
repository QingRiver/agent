import type { ApprovalDecision } from '../../lib/hitlContracts'
import { useAgent, useCopilotKit, useInterrupt } from '@copilotkit/react-core/v2'
import { useCallback, useEffect, useState } from 'react'
import { useConversations } from '../../hooks/useConversations'
import { AGENT_IDS } from '../../lib/agentIds'
import { narrowApprovalInterruptValue } from '../../lib/hitlContracts'
import { ApprovalCard } from './ApprovalCard'

interface HitlInterruptUiProps {
  threadId: string
}

/**
 * 审批 UI 注入 CopilotChat 消息流（与 useInterrupt 默认 renderInChat 同位置）。
 * - 进行中 run：useInterrupt 订阅 on_interrupt
 * - 刷新后：threadState.pendingInterrupt 来自 checkpoint hydrate
 */
export function HitlInterruptUi({ threadId }: HitlInterruptUiProps) {
  const { threadState, reloadActiveThread } = useConversations()
  const { copilotkit } = useCopilotKit()
  const { agent } = useAgent({ agentId: AGENT_IDS.hitl })
  const [busy, setBusy] = useState(false)

  const liveElement = useInterrupt({
    agentId: AGENT_IDS.hitl,
    renderInChat: false,
    enabled: event => event.name === 'on_interrupt',
    render: ({ event, resolve }) => {
      const payload = narrowApprovalInterruptValue(event.value)
      if (!payload)
        return <></>

      return (
        <ApprovalCard
          title={payload.message}
          content={payload.details}
          onApprove={() => resolve({ approved: true })}
          onReject={() => resolve({ approved: false, reason: '用户拒绝' })}
        />
      )
    },
  })

  const resumeFromCheckpoint = useCallback(async (decision: ApprovalDecision) => {
    setBusy(true)
    try {
      agent.threadId = threadId
      await agent.runAgent({
        forwardedProps: {
          command: { resume: decision },
        },
      })
      await reloadActiveThread()
    }
    finally {
      setBusy(false)
    }
  }, [agent, threadId, reloadActiveThread])

  const pending = threadState?.pendingInterrupt
  const checkpointElement = pending != null
    ? (
        <div className={busy ? 'pointer-events-none opacity-60' : undefined}>
          <ApprovalCard
            title={pending.message}
            content={pending.details}
            onApprove={() => { void resumeFromCheckpoint({ approved: true }) }}
            onReject={() => { void resumeFromCheckpoint({ approved: false, reason: '用户拒绝' }) }}
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
