import type { AbstractAgent } from '@ag-ui/client'
import { hitlAgent } from './hitlAgent'
import { obsidianAgent } from './obsidianAgent'
import { simpleAgent } from './simpleAgent'
import { simpleToolCallAgent } from './simpleToolCallAgent'
import { weatherAgent } from './weatherAgent'

const AGENT_IDS = ['hitl', 'obsidian', 'simple', 'simpleToolCall', 'weather'] as const
type AgentId = typeof AGENT_IDS[number]

export { buildMessagesInput } from './extractLastUserMessage'
export { hitlAgent } from './hitlAgent'
export { obsidianAgent, obsidianGraphApp } from './obsidianAgent'
export { simpleAgent, simpleGraphApp } from './simpleAgent'
export { simpleToolCallAgent } from './simpleToolCallAgent'
export { weatherAgent, weatherGraphApp } from './weatherAgent'

const agents: Record<AgentId, AbstractAgent> = {
  hitl: hitlAgent,
  obsidian: obsidianAgent,
  simple: simpleAgent,
  simpleToolCall: simpleToolCallAgent,
  weather: weatherAgent,
}

export function getAgent(agentId: string): AbstractAgent {
  if (!AGENT_IDS.includes(agentId as AgentId))
    throw new Error(`Unknown agent: ${agentId}`)
  return agents[agentId as AgentId]
}
