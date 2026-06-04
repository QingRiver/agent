import { useAgentContext } from '@copilotkit/react-core/v2'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { CopilotAgentShell } from '../components/copilot/CopilotAgentShell'
import { AGENT_IDS } from '../lib/agentIds'

export const Route = createFileRoute('/weather/')({
  component: WeatherAguiPage,
})

const DEFAULT_MESSAGE = '北京今天天气怎么样？'

function WeatherContextPanel() {
  const [message, setMessage] = useState(DEFAULT_MESSAGE)

  useAgentContext({
    description: '用户天气查询，传入 weather graph',
    value: { message },
  })

  return (
    <label className="mt-4 block text-sm text-slate-300">
      默认查询（会作为 Agent context）
      <input
        type="text"
        value={message}
        onChange={e => setMessage(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
      />
    </label>
  )
}

function WeatherAguiPage() {
  return (
    <CopilotAgentShell
      agentId={AGENT_IDS.weather}
      title="Weather Agent"
      description={(
        <>
          ReAct 天气 Agent · CopilotKit
          {' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">weather</code>
          {' '}
          ·
          {' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">streamEvents(v3)</code>
          {' '}
          +
          {' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">AguiTransformer</code>
          {' '}
          AG-UI 投影。纯 LangGraph SSE 见同页签栏「SSE」。
        </>
      )}
      placeholder="问天气，例如：上海今天天气如何？"
      chatClassName="h-[calc(100vh-280px)] min-h-[20rem]"
    >
      <WeatherContextPanel />
    </CopilotAgentShell>
  )
}
