import type { LangGraphAguiAgent } from '../agui/LangGraphAguiAgent'
import { hitlAgent } from './hitl'
import { simpleAgent } from './simple'
import { weatherAgent } from './weather'

const AGENT_IDS = ['hitl', 'simple', 'weather'] as const
type AgentId = typeof AGENT_IDS[number]

export { hitlAgent } from './hitl'
export { simpleAgent } from './simple'
export { weatherAgent } from './weather'

const agents: Record<AgentId, LangGraphAguiAgent> = {
  hitl: hitlAgent,
  simple: simpleAgent,
  weather: weatherAgent,
}

export function getAgent(agentId: string): LangGraphAguiAgent {
  if (!AGENT_IDS.includes(agentId as AgentId)) {
    throw new Error(`Unknown agent: ${agentId}`)
  }
  return agents[agentId as AgentId]
}
