import type { RunAgentInput } from '@ag-ui/core'
import type { AguiTransformerGraphApp } from './streamGraphAguiEvents'
import { getAguiGraphApp, getRawGraphApp } from '../graphs/graphAppFactory'
import { buildMessagesInput, extractLastUserMessage } from './extractLastUserMessage'
import { GraphTransformerAguiAgent } from './graphTransformerAguiAgent'
import { streamGraphAguiEvents } from './streamGraphAguiEvents'

export const obsidianGraphApp = getRawGraphApp('obsidianRaw', 'guest')

function streamObsidianEvents(input: RunAgentInput) {
  const obsidianGraphAguiApp = getAguiGraphApp('obsidian') as AguiTransformerGraphApp
  return streamGraphAguiEvents(
    input,
    obsidianGraphAguiApp,
    {
      resolveStreamInput: () => buildMessagesInput(extractLastUserMessage(input, {
        defaultMessage: '子集和真子集有什么区别？',
      })),
    },
  )
}

export const obsidianAgent = new GraphTransformerAguiAgent(
  { agentId: 'obsidian', description: 'Obsidian 检索 ReAct + AguiTransformer（v3）' },
  streamObsidianEvents,
)
