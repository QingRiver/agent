import type { RunAgentInput } from '@ag-ui/core'
import type { GraphsName } from '@agent/graph'
import type { AguiTransformerGraphApp } from './streamGraphAguiEvents'
import {
  aguiTransformerFactory,
  Graphs,
  resolveResumeFromRunAgentInput,
} from '@agent/graph'
import { HumanMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { getCheckpointer } from '../db/checkpointer'
import { buildMessagesInput, extractLastUserMessage } from './extractLastUserMessage'
import { GraphTransformerAguiAgent } from './graphTransformerAguiAgent'
import { streamGraphAguiEvents } from './streamGraphAguiEvents'

interface GraphAgentDefinition {
  description: string
  resolveStreamInput: (input: RunAgentInput) => unknown
}

const GRAPH_AGENT_DEFINITIONS = {
  claudeAgent: {
    description: 'Claude Agent SDK + LangGraph checkpoint + AG-UI',
    resolveStreamInput: input => buildMessagesInput(extractLastUserMessage(input, {
      defaultMessage: '你好，请简要介绍这个仓库的结构。',
    })),
  },
  simple: {
    description: '两节点示例图',
    resolveStreamInput: (input) => {
      const userText = extractLastUserMessage(input, { defaultMessage: '' })
      if (userText.trim())
        return buildMessagesInput(userText)
      return { messages: [] }
    },
  },
  simpleToolCall: {
    description: 'simpleToolCallGraph）',
    resolveStreamInput: input => buildMessagesInput(extractLastUserMessage(input, {
      defaultMessage: '取消订单 10086',
    })),
  },
  weather: {
    description: 'Weather ReAct）',
    resolveStreamInput: input => buildMessagesInput(extractLastUserMessage(input, {
      stateKeys: ['message'],
      defaultMessage: '北京今天天气怎么样？',
    })),
  },
  obsidian: {
    description: 'Obsidian 检索 ReAct）',
    resolveStreamInput: input => buildMessagesInput(extractLastUserMessage(input, {
      defaultMessage: '子集和真子集有什么区别？',
    })),
  },
  hitl: {
    description: 'LangGraph HITL 中断投影）',
    resolveStreamInput: (input) => {
      const resume = resolveResumeFromRunAgentInput(input)
      if (resume != null)
        return new Command({ resume })
      const userText = extractLastUserMessage(input, {
        stateKeys: ['input'],
        defaultMessage: '向账户 0x123... 转账 100 ETH',
      })
      return {
        input: userText,
        messages: [new HumanMessage(userText)],
      }
    },
  },
  tushare: {
    description: 'A股个股分析（Tushare MCP + ask_human 中断）',
    resolveStreamInput: (input) => {
      // ask_human 续接：resolve_stock / ask_* 工具内 interrupt 后，恢复值经 Command({resume}) 回灌
      const resume = resolveResumeFromRunAgentInput(input)
      if (resume != null)
        return new Command({ resume })
      const userText = extractLastUserMessage(input, {
        defaultMessage: '分析平安银行最近走势',
      })
      return buildMessagesInput(userText)
    },
  },
  writer: {
    description: '中文文本润色 writer（流式输出润色后完整文本）',
    resolveStreamInput: (input) => {
      // 原文可经 state.originalMarkdown 或最后 user message 传入
      const userText = extractLastUserMessage(input, {
        stateKeys: ['originalMarkdown'],
        defaultMessage: '',
      })
      if (userText.trim())
        return buildMessagesInput(userText)
      return { messages: [] }
    },
  },
} as const satisfies Record<GraphsName, GraphAgentDefinition>

export function listGraphAgentCatalog(): { name: GraphsName, description: string }[] {
  return (Object.keys(Graphs) as GraphsName[]).map(name => ({
    name,
    description: GRAPH_AGENT_DEFINITIONS[name].description,
  }))
}

const aguiCache = new Map<GraphsName, AguiTransformerGraphApp>()

export function getAguiGraphApp(name: GraphsName): AguiTransformerGraphApp {
  const cached = aguiCache.get(name)
  if (cached)
    return cached

  const compiled = Graphs[name].compile({
    checkpointer: getCheckpointer(),
    transformers: [aguiTransformerFactory],
  }) as AguiTransformerGraphApp

  aguiCache.set(name, compiled)
  return compiled
}

function createGraphAgent(name: GraphsName): GraphTransformerAguiAgent {
  const definition = GRAPH_AGENT_DEFINITIONS[name]
  return new GraphTransformerAguiAgent(
    { agentId: name, description: definition.description },
    input => streamGraphAguiEvents(input, getAguiGraphApp(name), {
      resolveStreamInput: definition.resolveStreamInput,
    }),
  )
}

export const copilotAgents = Object.fromEntries(
  (Object.keys(Graphs) as GraphsName[]).map(name => [name, createGraphAgent(name)]),
) as Record<GraphsName, GraphTransformerAguiAgent>
