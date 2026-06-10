export const AGENT_IDS = {
  claudeAgent: 'claudeAgent',
  hitl: 'hitl',
  obsidian: 'obsidian',
  simple: 'simple',
  simpleToolCall: 'simpleToolCall',
  weather: 'weather',
} as const

export type AgentId = typeof AGENT_IDS[keyof typeof AGENT_IDS]
