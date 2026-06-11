import type { RunAgentInput } from '@ag-ui/core'
import type { AguiTransformerGraphApp } from './streamGraphAguiEvents'
import { getAguiGraphApp } from '../graphs/graphAppFactory'
import { buildMessagesInput, extractLastUserMessage } from './extractLastUserMessage'
import { GraphTransformerAguiAgent } from './graphTransformerAguiAgent'
import { streamGraphAguiEvents } from './streamGraphAguiEvents'

function streamClaudeEvents(input: RunAgentInput) {
  const claudeAgentGraphApp = getAguiGraphApp('claudeAgent') as AguiTransformerGraphApp
  return streamGraphAguiEvents(
    input,
    claudeAgentGraphApp,
    {
      resolveStreamInput: () => buildMessagesInput(extractLastUserMessage(input, {
        defaultMessage: '你好，请简要介绍这个仓库的结构。',
      })),
    },
  )
}

export const claudeAgent = new GraphTransformerAguiAgent(
  { agentId: 'claudeAgent', description: 'Claude Agent SDK + LangGraph checkpoint + AG-UI' },
  streamClaudeEvents,
)
