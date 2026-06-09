import type { RunAgentInput } from '@ag-ui/core'
import type { AguiTransformerGraphApp } from './streamGraphAguiEvents'
import { getAguiGraphApp, getRawGraphApp } from '../graphs/graphAppFactory'
import { GraphTransformerAguiAgent } from './graphTransformerAguiAgent'
import { streamGraphAguiEvents } from './streamGraphAguiEvents'

export const simpleGraphApp = getRawGraphApp('simpleRaw', 'guest')

function streamSimpleEvents(input: RunAgentInput) {
  const simpleGraphAguiApp = getAguiGraphApp('simple') as AguiTransformerGraphApp
  return streamGraphAguiEvents(
    input,
    simpleGraphAguiApp,
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
