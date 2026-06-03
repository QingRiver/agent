import { CopilotChat } from '@copilotkit/react-core/v2'
import { AGENT_IDS } from '../../lib/agentIds'

interface HitlCopilotChatProps {
  placeholder?: string
}

/** HITL 审批 UI 由 `useInterrupt`（CUSTOM on_interrupt）注入 CopilotChat */
export function HitlCopilotChat({ placeholder }: HitlCopilotChatProps) {
  return (
    <CopilotChat
      agentId={AGENT_IDS.hitl}
      labels={{ chatInputPlaceholder: placeholder }}
    />
  )
}
