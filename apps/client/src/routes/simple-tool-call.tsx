import { createFileRoute } from '@tanstack/react-router'
import { CopilotAgentShell } from '../components/copilot/CopilotAgentShell'
import { AGENT_IDS } from '../lib/agentIds'

export const Route = createFileRoute('/simple-tool-call')({
  component: SimpleToolCallPage,
})

function SimpleToolCallPage() {
  return (
    <CopilotAgentShell
      agentId={AGENT_IDS.simpleToolCall}
      title="Simple Tool Call（AG-UI）"
      description="取消订单演示：tool / custom / message 经 AguiTransformer v3 合并为 aguiEvents。"
      placeholder="例如：取消订单 10086"
    />
  )
}
