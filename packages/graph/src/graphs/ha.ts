import type { BaseMessage } from '@langchain/core/messages'
import { ASK_TOOLS_SYSTEM_PROMPT } from '@agent/proto'
import { SystemMessage } from '@langchain/core/messages'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { shouldContinue } from '../edges/shouldContinue'
import { LazyToolNode } from '../nodes/lazyToolNode'
import { getHaToolset } from '../tools/ha/toolset'
import { fixMisplacedToolCalls } from '../tools/tushare/fixMisplacedToolCalls'

const HA_SYSTEM_PROMPT = [
  '你是 Home Assistant 助手，通过 MCP 工具查询与控制已暴露给 Assist 的智能家居实体。',
  '优先使用可用工具完成用户请求；不确定实体或操作时向用户确认。',
  '不要编造未通过工具返回的状态。',
].join('\n')

const HaState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
})

async function agent(state: typeof HaState.State) {
  const { llmWithTools } = await getHaToolset()
  const messages = state.messages[0]?.type === 'system'
    ? state.messages
    : [new SystemMessage(`${HA_SYSTEM_PROMPT}\n\n${ASK_TOOLS_SYSTEM_PROMPT}`), ...state.messages]
  const response = await llmWithTools.invoke(messages)
  return { messages: [fixMisplacedToolCalls(response)] }
}

function haContinue(state: typeof HaState.State): 'tools' | typeof END {
  return shouldContinue(state) === 'tools' ? 'tools' : END
}

export { buildHaToolset } from '../tools/ha/toolset'

/** tools 直接挂 LazyToolNode，避免外层 toolNode.invoke 双发 TOOL_CALL_START */
export const haGraph = new StateGraph(HaState)
  .addNode('agent', agent)
  .addNode('tools', new LazyToolNode(async () => {
    const { tools } = await getHaToolset()
    return tools
  }))
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', haContinue, {
    tools: 'tools',
    [END]: END,
  })
  .addEdge('tools', 'agent')
