import type { AgentId } from '../lib/agentIds'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { CopilotAgentShell } from '../components/copilot/CopilotAgentShell'
import { HitlInterruptUi } from '../components/hitl/HitlInterruptUi'
import { AGENT_IDS } from '../lib/agentIds'
import { AGUI_AGENTS, DEFAULT_AGUI_AGENT_ID } from '../lib/aguiAgents'

export const Route = createFileRoute('/agui')({
  component: AguiPage,
})

function AguiPage() {
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId>(DEFAULT_AGUI_AGENT_ID)
  const agent = AGUI_AGENTS.find(a => a.agentId === selectedAgentId) ?? AGUI_AGENTS[0]

  return (
    <CopilotAgentShell
      agentId={agent.agentId}
      title="AG-UI 演示"
      chatKey={agent.agentId}
      chatClassName={agent.chatClassName}
      placeholder={agent.placeholder}
    >
      <label className="mt-4 block text-sm text-slate-300">
        选择 Agent
        <select
          value={selectedAgentId}
          onChange={e => setSelectedAgentId(e.target.value as AgentId)}
          className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        >
          {AGUI_AGENTS.map(item => (
            <option key={item.agentId} value={item.agentId}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4">
        <h2 className="text-lg font-medium text-slate-200">{agent.label}</h2>
        <div className="mt-1 text-sm text-slate-400">{agent.description}</div>
        {agent.footnote != null && (
          <p className="mt-2 text-xs text-slate-500">{agent.footnote}</p>
        )}
      </div>

      {agent.agentId === AGENT_IDS.hitl && <HitlInterruptUi />}
      {agent.renderExtras?.()}
    </CopilotAgentShell>
  )
}
