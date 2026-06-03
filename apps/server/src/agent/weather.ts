import type { RunAgentInput } from '@ag-ui/core'
import { LangGraphAguiAgent } from '../agui/LangGraphAguiAgent'
import { buildWeatherInput, weatherGraphApp } from '../graphs/index'

function extractWeatherMessage(input: RunAgentInput): string {
  const state = input.state as { message?: string } | undefined
  if (state?.message?.trim())
    return state.message.trim()

  const lastUser = [...input.messages].reverse().find(m => m.role === 'user')
  if (lastUser && typeof lastUser.content === 'string' && lastUser.content.trim())
    return lastUser.content.trim()

  return '北京今天天气怎么样？'
}

export const weatherAgent = new LangGraphAguiAgent({
  agentId: 'weather',
  description: 'Weather ReAct Agent',
  graph: weatherGraphApp,
  resolvePayload: input => buildWeatherInput(extractWeatherMessage(input)),
})
