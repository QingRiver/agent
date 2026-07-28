import type { BaseMessage } from '@langchain/core/messages'
import { ASK_TOOLS_SYSTEM_PROMPT } from '@agent/protocol'
import { TUSHARE_SYSTEM_PROMPT } from '@agent/tools'
import { SystemMessage } from '@langchain/core/messages'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { shouldContinue } from '../edges/shouldContinue'
import { LazyToolNode } from '../nodes/lazyToolNode'
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
  const messages = state.messages[0]?.type === 'system'
    ? state.messages
    : [new SystemMessage(`${TUSHARE_SYSTEM_PROMPT}\n\n${ASK_TOOLS_SYSTEM_PROMPT}`), ...state.messages]
  const response = await llmWithTools.invoke(messages)
  return { messages: [fixMisplacedToolCalls(response)] }
}

function tushareContinue(state: typeof TushareState.State): 'tools' | typeof END {
  return shouldContinue(state) === 'tools' ? 'tools' : END
}

export { buildTushareToolset } from '../tools/tushare/toolset'

/** tools 直接挂 LazyToolNode，避免外层 toolNode.invoke 双发 TOOL_CALL_START */
export const tushareGraph = new StateGraph(TushareState)
  .addNode('agent', agent)
  .addNode('tools', new LazyToolNode(async () => {
    const { tools } = await getTushareToolset()
    return tools
  }))
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', tushareContinue, {
    tools: 'tools',
    [END]: END,
  })
  .addEdge('tools', 'agent')
