import type { BaseMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { runQueryInGraphNode } from '@agent/claude-agent'
import { HumanMessage } from '@langchain/core/messages'
import { Annotation, StateGraph } from '@langchain/langgraph'

const ClaudeAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  claudeSessionId: Annotation<string | undefined>({
    reducer: (_x, y) => y,
    default: () => undefined,
  }),
})

function lastUserText(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (HumanMessage.isInstance(message)) {
      const content = message.content
      if (typeof content === 'string' && content.trim())
        return content.trim()
    }
  }
  throw new Error('Claude agent graph: no user message in state')
}

async function claudeAgentNode(
  state: typeof ClaudeAgentState.State,
  config: LangGraphRunnableConfig,
) {
  const prompt = lastUserText(state.messages)
  const writer = config.writer
    ? (payload: { name: string, payload: unknown }) => config.writer?.(payload)
    : undefined

  const result = await runQueryInGraphNode({
    prompt,
    claudeSessionId: state.claudeSessionId,
    writer,
  })

  return {
    messages: result.messages,
    claudeSessionId: result.claudeSessionId,
  }
}

export const claudeAgentGraph = new StateGraph(ClaudeAgentState)
  .addNode('claude_agent', claudeAgentNode)
  .addEdge('__start__', 'claude_agent')
  .addEdge('claude_agent', '__end__')
