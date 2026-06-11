import { CopilotRuntime } from '@copilotkit/runtime/v2'
import { claudeAgent, hitlAgent, obsidianAgent, simpleAgent, simpleToolCallAgent, weatherAgent } from '../agent'
import { CheckpointConnectRunner } from './checkpointConnectRunner'

export const copilotRuntime = new CopilotRuntime({
  runner: new CheckpointConnectRunner(),
  agents: {
    claudeAgent: claudeAgent as never,
    hitl: hitlAgent as never,
    obsidian: obsidianAgent as never,
    simple: simpleAgent as never,
    simpleToolCall: simpleToolCallAgent as never,
    weather: weatherAgent as never,
  },
})
