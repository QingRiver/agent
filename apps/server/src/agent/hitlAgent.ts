import type { RunAgentInput } from '@ag-ui/core'
import type { AguiTransformerGraphApp } from './streamGraphAguiEvents'
import { resolveResumeFromRunAgentInput } from '@agent/graph'
import { HumanMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { getAguiGraphApp } from '../graphs/graphAppFactory'
import { extractLastUserMessage } from './extractLastUserMessage'
import { GraphTransformerAguiAgent } from './graphTransformerAguiAgent'
import { streamGraphAguiEvents } from './streamGraphAguiEvents'

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
        const userText = extractLastUserMessage(inp, {
          stateKeys: ['input'],
          defaultMessage: '向账户 0x123... 转账 100 ETH',
        })
        return {
          input: userText,
          messages: [new HumanMessage(userText)],
        }
      },
    },
  )
}

export const hitlAgent = new GraphTransformerAguiAgent(
  { agentId: 'hitl', description: 'LangGraph HITL + AguiTransformer（v3 中断投影）' },
  streamHitlEvents,
)
