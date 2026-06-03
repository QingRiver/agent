export const AGENT_IDS = {
  hitl: 'hitl',
  simple: 'simple',
  weather: 'weather',
} as const

export type AgentId = typeof AGENT_IDS[keyof typeof AGENT_IDS]
