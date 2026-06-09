import type { RunAgentInput } from '@ag-ui/core'
import type { AguiTransformerGraphApp } from './streamGraphAguiEvents'
import { getAguiGraphApp, getRawGraphApp } from '../graphs/graphAppFactory'
import { buildMessagesInput, extractLastUserMessage } from './extractLastUserMessage'
import { GraphTransformerAguiAgent } from './graphTransformerAguiAgent'
import { streamGraphAguiEvents } from './streamGraphAguiEvents'

export const weatherGraphApp = getRawGraphApp('weatherRaw', 'guest')

function streamWeatherEvents(input: RunAgentInput) {
  const weatherGraphAguiApp = getAguiGraphApp('weather') as AguiTransformerGraphApp
  return streamGraphAguiEvents(
    input,
    weatherGraphAguiApp,
    {
      resolveStreamInput: () => buildMessagesInput(extractLastUserMessage(input, {
        stateKeys: ['message'],
        defaultMessage: '北京今天天气怎么样？',
      })),
    },
  )
}

export const weatherAgent = new GraphTransformerAguiAgent(
  { agentId: 'weather', description: 'Weather ReAct + AguiTransformer（v3）' },
  streamWeatherEvents,
)
