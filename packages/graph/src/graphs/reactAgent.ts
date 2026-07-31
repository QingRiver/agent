import type { AIMessage, BaseMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import process from 'node:process'
import { SystemMessage } from '@langchain/core/messages'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { ChatOpenAI } from '@langchain/openai'
import { shouldContinue } from '../edges/shouldContinue'
import {
  composeReactAgentSystemPrompt,
  sanitizeUserPrompt,
} from '../prompts/reactAgentPrompts'
import { ASK_TOOLS } from '../tools/ask-tools'
import { KB_TOOLS } from '../tools/kb'

export {
  AGENT_CONFIG_ID_PROPS_KEY,
  clampMaxSteps,
  composeReactAgentSystemPrompt,
  DEFAULT_REACT_AGENT_USER_PROMPT,
  KB_SEARCH_SYSTEM_PROMPT,
  REACT_AGENT_FORWARDED_PROPS_KEY,
  REACT_AGENT_MAX_STEPS_DEFAULT,
  REACT_AGENT_MAX_STEPS_MAX,
  REACT_AGENT_MAX_STEPS_MIN,
  REACT_AGENT_USER_PROMPT_MAX,
  type ReactAgentRuntimeConfig,
  ReactAgentRuntimeConfigSchema,
  readAgentConfigId,
  readReactAgentForwardedProps,
  sanitizeKbId,
  sanitizeUserPrompt,
} from '../prompts/reactAgentPrompts'

const ReactAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
})

type ReactAgentStateType = typeof ReactAgentState.State

const tools = [...KB_TOOLS, ...ASK_TOOLS]
/** 必须直接挂 ToolNode：外层再 toolNode.invoke 会导致同 id 双发 TOOL_CALL_START（AG-UI verify 失败） */
const toolsNode = new ToolNode(tools)

const llmWithTools = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? '',
  temperature: 0,
}).bindTools(tools)

function readUserPrompt(config: LangGraphRunnableConfig): string {
  return sanitizeUserPrompt(config.configurable?.userPrompt)
}

async function agentNode(
  state: ReactAgentStateType,
  config: LangGraphRunnableConfig,
) {
  const systemContent = composeReactAgentSystemPrompt(readUserPrompt(config))
  const messages = state.messages[0]?.type === 'system'
    ? state.messages
    : [new SystemMessage(systemContent), ...state.messages]
  // 正常流式：模型按工具给出的模板写出标准 Markdown 链接 `[n](/kb?…)`
  const response = await llmWithTools.invoke(messages, config) as AIMessage
  return { messages: [response] }
}

function afterAgent(state: ReactAgentStateType): 'tools' | typeof END {
  return shouldContinue(state) === 'tools' ? 'tools' : END
}

/**
 * 环次数唯一由 streamEvents.recursionLimit（= 配置 maxSteps）约束。
 * kbId 由 server resolveConfigurable 写入 configurable，kb_search 自行读取。
 */
export const reactAgentGraph = new StateGraph(ReactAgentState)
  .addNode('agent', agentNode)
  .addNode('tools', toolsNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', afterAgent, {
    tools: 'tools',
    [END]: END,
  })
  .addEdge('tools', 'agent')
