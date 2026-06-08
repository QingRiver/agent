import type { RunAgentInput } from '@ag-ui/core'
import type { AguiTransformerGraphApp } from './streamGraphAguiEvents'
import { aguiTransformerFactory, weatherGraph } from '@agent/graph'
import { devMemoryCheckpointer } from '../graphs/memoryCheckpointer'
import { buildMessagesInput, extractLastUserMessage } from './extractLastUserMessage'
import { GraphTransformerAguiAgent } from './graphTransformerAguiAgent'
import { streamGraphAguiEvents } from './streamGraphAguiEvents'

export const weatherGraphApp = weatherGraph.compile({
  checkpointer: devMemoryCheckpointer,
})

const weatherGraphAguiApp = weatherGraph.compile({
  checkpointer: devMemoryCheckpointer,
  transformers: [aguiTransformerFactory],
})

function streamWeatherEvents(input: RunAgentInput) {
  return streamGraphAguiEvents(
    input,
    weatherGraphAguiApp as AguiTransformerGraphApp,
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
