import type { RunAgentInput } from '@ag-ui/core'
import type { AguiTransformerGraphApp } from './streamGraphAguiEvents'
import { aguiTransformerFactory, simpleGraph } from '@agent/graph'
import { devMemoryCheckpointer } from '../graphs/memoryCheckpointer'
import { GraphTransformerAguiAgent } from './graphTransformerAguiAgent'
import { streamGraphAguiEvents } from './streamGraphAguiEvents'

export const simpleGraphApp = simpleGraph.compile({
  checkpointer: devMemoryCheckpointer,
})

const simpleGraphAguiApp = simpleGraph.compile({
  checkpointer: devMemoryCheckpointer,
  transformers: [aguiTransformerFactory],
})

function streamSimpleEvents(input: RunAgentInput) {
  return streamGraphAguiEvents(
    input,
    simpleGraphAguiApp as AguiTransformerGraphApp,
    {
      resolveStreamInput: () => ({ messages: [] }),
      formatSummary: () => 'simpleGraph 流程已完成。',
    },
  )
}

export const simpleAgent = new GraphTransformerAguiAgent(
  { agentId: 'simple', description: '两节点示例图 + AguiTransformer（v3）' },
  streamSimpleEvents,
)
