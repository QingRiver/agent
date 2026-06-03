import { createFileRoute, Link } from '@tanstack/react-router'
import { CopilotAgentShell } from '../components/copilot/CopilotAgentShell'
import { AGENT_IDS } from '../lib/agentIds'

export const Route = createFileRoute('/simple')({
  component: SimplePage,
})

function SimplePage() {
  return (
    <CopilotAgentShell
      agentId={AGENT_IDS.simple}
      title="Simple Graph（AG-UI）"
      description={(
        <>
          两节点 LangGraph 经 CopilotKit
          {' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">simple</code>
          {' '}
          Agent 流式输出。纯 SSE 见
          {' '}
          <Link to="/sse" className="text-emerald-400 hover:underline">/sse</Link>
          。
        </>
      )}
      placeholder="发送任意消息以运行 simpleGraph…"
    />
  )
}
