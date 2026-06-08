import type { ReactNode } from 'react'
import { SimpleGraphSsePanel } from '../components/sse/SimpleGraphSsePanel'
import { WeatherSsePanel } from '../components/sse/WeatherSsePanel'

export type SseDemoId = 'simple' | 'weather'

export interface SseDemoConfig {
  id: SseDemoId
  label: string
  description: ReactNode
  apiHint: string
  renderPanel: () => ReactNode
}

export const SSE_DEMOS: SseDemoConfig[] = [
  {
    id: 'simple',
    label: 'Simple Graph',
    description: '两节点 LangGraph，流式打印后端 SSE 事件（start / update / done）。',
    apiHint: 'GET /sample/simpleGraph/sse',
    renderPanel: () => <SimpleGraphSsePanel />,
  },
  {
    id: 'weather',
    label: 'Weather',
    description: 'ReAct 天气 Agent 对话，展示 AI 回复与 Open-Meteo 工具调用。',
    apiHint: 'GET /sample/weather?message=',
    renderPanel: () => <WeatherSsePanel />,
  },
]

export const DEFAULT_SSE_DEMO_ID: SseDemoId = 'simple'

export function getSseDemo(id: SseDemoId): SseDemoConfig {
  const demo = SSE_DEMOS.find(d => d.id === id)
  if (!demo)
    throw new Error(`Unknown SSE demo: ${id}`)
  return demo
}
