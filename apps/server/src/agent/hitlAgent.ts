import type { RunAgentInput } from '@ag-ui/core'
import type { HitlWorkflowResult } from '@agent/graph'
import { aguiTransformerFactory, hitlGraph, resolveResumeFromRunAgentInput } from '@agent/graph'
import { Command } from '@langchain/langgraph'
import { devMemoryCheckpointer } from '../graphs/memoryCheckpointer'
import { extractLastUserMessage } from './extractLastUserMessage'
import { GraphTransformerAguiAgent } from './graphTransformerAguiAgent'
import type { AguiTransformerGraphApp } from './streamGraphAguiEvents'
import { streamGraphAguiEvents } from './streamGraphAguiEvents'

const hitlGraphAguiApp = hitlGraph.compile({
  checkpointer: devMemoryCheckpointer,
  transformers: [aguiTransformerFactory],
})

function formatHitlResult(result: HitlWorkflowResult | undefined): string {
  if (!result)
    return '工作流已结束。'
  if (result.status === 'approved')
    return `已批准执行：${result.toolInput}`
  return `已拒绝：${result.reason}`
}

function streamHitlEvents(input: RunAgentInput) {
  return streamGraphAguiEvents(
    input,
    hitlGraphAguiApp as AguiTransformerGraphApp,
    {
      resolveStreamInput: (inp) => {
        const resume = resolveResumeFromRunAgentInput(inp)
        if (resume != null)
          return new Command({ resume })
        return {
          input: extractLastUserMessage(inp, {
            stateKeys: ['input'],
            defaultMessage: '向账户 0x123... 转账 100 ETH',
          }),
        }
      },
      formatSummary: values => formatHitlResult(values.result as HitlWorkflowResult | undefined),
    },
  )
}

export const hitlAgent = new GraphTransformerAguiAgent(
  { agentId: 'hitl', description: 'LangGraph HITL + AguiTransformer（v3 中断投影）' },
  streamHitlEvents,
)
