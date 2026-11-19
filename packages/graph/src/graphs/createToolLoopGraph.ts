import type { BaseMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { AIMessage, SystemMessage } from '@langchain/core/messages'
import { Command, END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { LazyToolNode } from '../nodes/lazyToolNode'
import { createChatModel } from '../utils/chatModel'

export type ToolLoopTools = StructuredToolInterface[] | (() => Promise<StructuredToolInterface[]>)

export type ToolLoopSystem
  = | string
    | ((
      state: { messages: BaseMessage[] },
      config: LangGraphRunnableConfig,
    ) => string | Promise<string>)

export interface ToolLoopOptions {
  tools: ToolLoopTools
  system: ToolLoopSystem
  temperature?: number
  /** tools 节点名；多支路图需各自指定，默认 `tools` */
  toolsNodeName?: string
}

function isLazyTools(tools: ToolLoopTools): tools is () => Promise<StructuredToolInterface[]> {
  return typeof tools === 'function'
}

function hasToolCalls(message: BaseMessage): boolean {
  return AIMessage.isInstance(message) && !!message.tool_calls?.length
}

/** agent 节点 + tools 节点，供完整图或多支路图复用（agent 内用 Command 路由）。 */
export function createToolLoopParts(options: ToolLoopOptions) {
  const toolsNodeName = options.toolsNodeName ?? 'tools'
  const llm = createChatModel({ temperature: options.temperature ?? 0 })
  const staticTools = isLazyTools(options.tools) ? null : options.tools
  const llmWithTools = staticTools ? llm.bindTools(staticTools) : null
  const toolsNode = isLazyTools(options.tools)
    ? new LazyToolNode(options.tools)
    : new ToolNode(staticTools!)

  async function agent(
    state: { messages: BaseMessage[] },
    config: LangGraphRunnableConfig,
  ) {
    const system = typeof options.system === 'string'
      ? options.system
      : await options.system(state, config)
    const rest = state.messages[0]?.type === 'system' ? state.messages.slice(1) : state.messages
    const messages = [new SystemMessage(system), ...rest]
    const bound = llmWithTools ?? llm.bindTools(await (options.tools as () => Promise<StructuredToolInterface[]>)())
    const response = await bound.invoke(messages, config)
    return new Command({
      update: { messages: [response] },
      goto: hasToolCalls(response) ? toolsNodeName : END,
    })
  }

  return {
    agent,
    toolsNode,
    toolsNodeName,
    agentEnds: [toolsNodeName, END] as const,
  }
}

/** 标准 agent ↔ tools 环（MessagesAnnotation）。 */
export function createToolLoopGraph(options: ToolLoopOptions) {
  const { agent, toolsNode, toolsNodeName, agentEnds } = createToolLoopParts(options)
  return new StateGraph(MessagesAnnotation)
    .addNode('agent', agent, { ends: [...agentEnds] })
    .addNode(toolsNodeName, toolsNode)
    .addEdge(START, 'agent')
    .addEdge(toolsNodeName, 'agent')
}
