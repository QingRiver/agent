import type { RunAgentInput } from '@ag-ui/core'
import type { HitlWorkflowResult } from '@agent/graph'
import type { AguiTransformerGraphApp } from './streamGraphAguiEvents'
import { resolveResumeFromRunAgentInput } from '@agent/graph'
import { Command } from '@langchain/langgraph'
import { getAguiGraphApp } from '../graphs/graphAppFactory'
import { extractLastUserMessage } from './extractLastUserMessage'
import { GraphTransformerAguiAgent } from './graphTransformerAguiAgent'
import { streamGraphAguiEvents } from './streamGraphAguiEvents'

function formatHitlResult(result: HitlWorkflowResult | undefined): string {
  if (!result)
    return '工作流已结束。'
  if (result.status === 'approved')
    return `已批准执行：${result.toolInput}`
  return `已拒绝：${result.reason}`
}

function streamHitlEvents(input: RunAgentInput) {
  const hitlGraphAguiApp = getAguiGraphApp('hitl') as AguiTransformerGraphApp
  return streamGraphAguiEvents(
    input,
    hitlGraphAguiApp,
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
