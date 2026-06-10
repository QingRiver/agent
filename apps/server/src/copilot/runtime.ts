import { CopilotRuntime } from '@copilotkit/runtime/v2'
import { claudeAgent, hitlAgent, obsidianAgent, simpleAgent, simpleToolCallAgent, weatherAgent } from '../agent'

export const copilotRuntime = new CopilotRuntime({
  agents: {
    claudeAgent: claudeAgent as never,
    hitl: hitlAgent as never,
    obsidian: obsidianAgent as never,
    simple: simpleAgent as never,
    simpleToolCall: simpleToolCallAgent as never,
    weather: weatherAgent as never,
  },
})
