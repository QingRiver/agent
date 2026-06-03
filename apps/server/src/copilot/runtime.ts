import { CopilotRuntime } from '@copilotkit/runtime/v2'
import { hitlAgent, simpleAgent, weatherAgent } from '../agent'

export const copilotRuntime = new CopilotRuntime({
  agents: {
    hitl: hitlAgent as never,
    simple: simpleAgent as never,
    weather: weatherAgent as never,
  },
})
