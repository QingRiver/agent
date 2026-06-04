import type { RunAgentInput } from '@ag-ui/core'
import { aguiTransformerFactory, simpleToolCallGraph } from '@agent/graph'
import { devMemoryCheckpointer } from '../graphs/memoryCheckpointer'
import { buildMessagesInput, extractLastUserMessage } from './extractLastUserMessage'
import { GraphTransformerAguiAgent } from './graphTransformerAguiAgent'
import type { AguiTransformerGraphApp } from './streamGraphAguiEvents'
import { streamGraphAguiEvents } from './streamGraphAguiEvents'

const simpleToolCallGraphAguiApp = simpleToolCallGraph.compile({
  checkpointer: devMemoryCheckpointer,
  transformers: [aguiTransformerFactory],
})

function streamSimpleToolCallEvents(input: RunAgentInput) {
  return streamGraphAguiEvents(
    input,
    simpleToolCallGraphAguiApp as AguiTransformerGraphApp,
    {
      resolveStreamInput: () => buildMessagesInput(extractLastUserMessage(input, {
        defaultMessage: '取消订单 10086',
      })),
    },
  )
}

export const simpleToolCallAgent = new GraphTransformerAguiAgent(
  { agentId: 'simpleToolCall', description: 'simpleToolCallGraph + AguiTransformer（v3）' },
  streamSimpleToolCallEvents,
)
