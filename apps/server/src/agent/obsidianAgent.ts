import type { RunAgentInput } from '@ag-ui/core'
import type { AguiTransformerGraphApp } from './streamGraphAguiEvents'
import { aguiTransformerFactory, obsidianGraph } from '@agent/graph'
import { devMemoryCheckpointer } from '../graphs/memoryCheckpointer'
import { buildMessagesInput, extractLastUserMessage } from './extractLastUserMessage'
import { GraphTransformerAguiAgent } from './graphTransformerAguiAgent'
import { streamGraphAguiEvents } from './streamGraphAguiEvents'

export const obsidianGraphApp = obsidianGraph.compile({
  checkpointer: devMemoryCheckpointer,
})

const obsidianGraphAguiApp = obsidianGraph.compile({
  checkpointer: devMemoryCheckpointer,
  transformers: [aguiTransformerFactory],
})

function streamObsidianEvents(input: RunAgentInput) {
  return streamGraphAguiEvents(
    input,
    obsidianGraphAguiApp as AguiTransformerGraphApp,
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
