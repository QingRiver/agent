import { useInterrupt } from '@copilotkit/react-core/v2'
import { AGENT_IDS } from '../../lib/agentIds'
import { narrowApprovalInterruptValue } from '../../lib/hitlContracts'
import { ApprovalCard } from './ApprovalCard'

/** 订阅 AG-UI CUSTOM(on_interrupt)，在 CopilotChat 内渲染审批卡 */
export function HitlInterruptUi() {
  useInterrupt({
    agentId: AGENT_IDS.hitl,
    enabled: event => event.name === 'on_interrupt',
    render: ({ event, resolve }) => {
      const payload = narrowApprovalInterruptValue(event.value)
      if (!payload)
        return <></>

      return (
        <ApprovalCard
          variant="bubble"
          title={payload.message}
          content={payload.details}
          onApprove={() => resolve({ approved: true })}
          onReject={() => resolve({ approved: false, reason: '用户拒绝' })}
        />
      )
    },
  })

  return null
}
