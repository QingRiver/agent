import type { ReactNode } from 'react'
import type { AgentId } from './agentIds'
import { HitlContextPanel } from '../components/agui/HitlContextPanel'
import { WeatherContextPanel } from '../components/agui/WeatherContextPanel'
import { AGENT_IDS } from './agentIds'

export interface AguiAgentConfig {
  agentId: AgentId
  label: string
  description: ReactNode
  placeholder: string
  chatClassName?: string
  footnote?: ReactNode
  renderExtras?: () => ReactNode
}

export const AGUI_AGENTS: AguiAgentConfig[] = [
  {
    agentId: AGENT_IDS.simple,
    label: 'Simple Graph',
    description: '两节点 LangGraph 经 CopilotKit simple Agent 流式输出。纯 SSE 见 /sse。',
    placeholder: '发送任意消息以运行 simpleGraph…',
  },
  {
    agentId: AGENT_IDS.simpleToolCall,
    label: 'Tool Call',
    description: '取消订单演示：tool / custom / message 经 AguiTransformer v3 合并为 aguiEvents。',
    placeholder: '例如：取消订单 10086',
  },
  {
    agentId: AGENT_IDS.weather,
    label: 'Weather',
    description: (
      <>
        ReAct 天气 Agent · CopilotKit weather · streamEvents(v3) + AguiTransformer AG-UI 投影。纯 LangGraph SSE 见
        {' '}
        /weather/sse
        。
      </>
    ),
    placeholder: '问天气，例如：上海今天天气如何？',
    chatClassName: 'h-[calc(100vh-320px)] min-h-[20rem]',
    renderExtras: () => <WeatherContextPanel />,
  },
  {
    agentId: AGENT_IDS.hitl,
    label: '人在回路',
    description: 'LangGraph interrupt() + CopilotKit useInterrupt + AguiTransformer 中断投影 + AG-UI /copilotkit',
    placeholder: '输入消息启动 HITL 流程…',
    renderExtras: () => (
      <>
        <HitlContextPanel />
        <p className="mt-2 text-xs text-slate-500">
          等待「正在连接 Agent 运行时…」消失后再发送消息；审批卡会在聊天流中弹出。
        </p>
      </>
    ),
  },
  {
    agentId: AGENT_IDS.obsidian,
    label: 'Obsidian',
    description: (
      <>
        ReAct 调用 obsidian_search：严格关键词搜索（不模糊匹配）→ 取前 5 条 → mini 模型信息抽取。禁止自行拓展 search_keywords。需本地 Obsidian
        {' '}
        localhost:51361
        。
      </>
    ),
    placeholder: '向知识库提问，例如：子集和真子集有什么区别？',
    chatClassName: 'h-[calc(100vh-320px)] min-h-[20rem]',
  },
]

export const DEFAULT_AGUI_AGENT_ID = AGENT_IDS.simple

export function getAguiAgent(agentId: AgentId): AguiAgentConfig {
  const agent = AGUI_AGENTS.find(a => a.agentId === agentId)
  if (!agent)
    throw new Error(`Unknown AG-UI agent: ${agentId}`)
  return agent
}
