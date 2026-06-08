import { CopilotRuntime } from '@copilotkit/runtime/v2'
import { hitlAgent, obsidianAgent, simpleAgent, simpleToolCallAgent, weatherAgent } from '../agent'

export const copilotRuntime = new CopilotRuntime({
  agents: {
    hitl: hitlAgent as never,
    obsidian: obsidianAgent as never,
    simple: simpleAgent as never,
    simpleToolCall: simpleToolCallAgent as never,
    weather: weatherAgent as never,
  },
})
