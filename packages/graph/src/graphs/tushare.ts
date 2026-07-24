import type { BaseMessage } from '@langchain/core/messages'
import { TUSHARE_SYSTEM_PROMPT } from '@agent/tools'
import { SystemMessage } from '@langchain/core/messages'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { shouldContinue } from '../edges/shouldContinue'
import { ASK_SYSTEM_PROMPT } from '../tools/ask-tools'
import { fixMisplacedToolCalls } from '../tools/tushare/fixMisplacedToolCalls'
import { getTushareToolset } from '../tools/tushare/toolset'

const TushareState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
})

async function agent(state: typeof TushareState.State) {
  const { llmWithTools } = await getTushareToolset()
  const messages = state.messages[0]?.getType() === 'system'
    ? state.messages
    : [new SystemMessage(`${TUSHARE_SYSTEM_PROMPT}\n\n${ASK_SYSTEM_PROMPT}`), ...state.messages]
  const response = await llmWithTools.invoke(messages)
  return { messages: [fixMisplacedToolCalls(response)] }
}

async function toolsNode(state: typeof TushareState.State) {
  const { toolNode } = await getTushareToolset()
  return toolNode.invoke(state)
}

function tushareContinue(state: typeof TushareState.State): 'tools' | typeof END {
  return shouldContinue(state) === 'tools' ? 'tools' : END
}

export { buildTushareToolset } from '../tools/tushare/toolset'

export const tushareGraph = new StateGraph(TushareState)
  .addNode('agent', agent)
  .addNode('tools', toolsNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', tushareContinue, {
    tools: 'tools',
    [END]: END,
  })
  .addEdge('tools', 'agent')
