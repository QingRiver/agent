import type { RunAgentInput } from '@ag-ui/core'
import type { AguiTransformerGraphApp } from './streamGraphAguiEvents'
import { getAguiGraphApp } from '../graphs/graphAppFactory'
import { buildMessagesInput, extractLastUserMessage } from './extractLastUserMessage'
import { GraphTransformerAguiAgent } from './graphTransformerAguiAgent'
import { streamGraphAguiEvents } from './streamGraphAguiEvents'

function streamSimpleToolCallEvents(input: RunAgentInput) {
  const simpleToolCallGraphAguiApp = getAguiGraphApp('simpleToolCall') as AguiTransformerGraphApp
  return streamGraphAguiEvents(
    input,
    simpleToolCallGraphAguiApp,
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
