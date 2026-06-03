import { useAgentContext } from '@copilotkit/react-core/v2'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { CopilotAgentShell } from '../components/copilot/CopilotAgentShell'
import { HitlCopilotChat } from '../components/hitl/HitlCopilotChat'
import { HitlInterruptUi } from '../components/hitl/HitlInterruptUi'
import { AGENT_IDS } from '../lib/agentIds'

export const Route = createFileRoute('/hitl')({
  component: HitlPage,
})

const DEFAULT_INPUT = '向账户 0x123... 转账 100 ETH'

function HitlContextPanel() {
  const [sensitiveInput, setSensitiveInput] = useState(DEFAULT_INPUT)

  useAgentContext({
    description: '待审批的敏感操作描述，传入 LangGraph 的 input 字段',
    value: { input: sensitiveInput },
  })

  return (
    <label className="mt-4 block text-sm text-slate-300">
      敏感操作描述
      <input
        type="text"
        value={sensitiveInput}
        onChange={e => setSensitiveInput(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
      />
    </label>
  )
}

function HitlPage() {
  return (
    <CopilotAgentShell
      agentId={AGENT_IDS.hitl}
      title="人在回路（Human-in-the-Loop）"
      description={(
        <>
          LangGraph
          {' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">interrupt()</code>
          {' '}
          + CopilotKit
          {' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">useInterrupt</code>
          {' '}
          · AG-UI
          {' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">/copilotkit</code>
        </>
      )}
      chat={<HitlCopilotChat placeholder="输入消息启动 HITL 流程…" />}
    >
      <HitlInterruptUi />
      <HitlContextPanel />
      <p className="mt-2 text-xs text-slate-500">
        等待「正在连接 Agent 运行时…」消失后再发送消息；审批卡会在聊天流中弹出。
      </p>
    </CopilotAgentShell>
  )
}
