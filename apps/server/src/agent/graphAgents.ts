import type { RunAgentInput } from '@ag-ui/core'
import type { GraphsName } from '@agent/graph'
import type { AguiTransformerGraphApp, StreamGraphAguiOptions } from './streamGraphAguiEvents'
import { env } from '@agent/env'
import {
  aguiTransformerFactory,
  clampMaxSteps,
  Graphs,
  REACT_AGENT_MAX_STEPS_DEFAULT,
  readReactAgentForwardedProps,
  resolveResumeFromRunAgentInput,
  sanitizeKbId,
  sanitizeUserPrompt,
} from '@agent/graph'
import { HumanMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { getCheckpointer } from '../db/checkpointer'
import { buildMessagesInput, extractLastUserMessage } from './extractLastUserMessage'
import { GraphTransformerAguiAgent } from './graphTransformerAguiAgent'
import { attachResolveAgentConfigMiddleware } from './middleware/resolveAgentConfig'
import { streamGraphAguiEvents } from './streamGraphAguiEvents'

interface GraphAgentDefinition {
  description: string
  resolveStreamInput: (input: RunAgentInput) => unknown
  resolveConfigurable?: (input: RunAgentInput) => Record<string, unknown>
  resolveRecursionLimit?: (input: RunAgentInput) => number | undefined
}

const GRAPH_AGENT_DEFINITIONS = {
  claudeAgent: {
    description: 'Claude Agent SDK + LangGraph checkpoint + AG-UI',
    resolveStreamInput: input => buildMessagesInput(extractLastUserMessage(input, {
      defaultMessage: '你好，请简要介绍这个仓库的结构。',
    })),
  },
  reactAgent: {
    description: '通用 ReAct（可配 prompt + ask_* + kb_search，Lab 试验台）',
    resolveStreamInput: (input) => {
      const resume = resolveResumeFromRunAgentInput(input)
      if (resume != null)
        return new Command({ resume })
      const userText = extractLastUserMessage(input, {
        defaultMessage: '你好',
      })
      return buildMessagesInput(userText)
    },
    resolveConfigurable: (input) => {
      const forwarded = readReactAgentForwardedProps(input)
      return {
        userPrompt: sanitizeUserPrompt(forwarded.userPrompt),
        kbId: sanitizeKbId(forwarded.kbId, env.KB_COLLECTION),
      }
    },
    /** 唯一环控：配置 maxSteps ≡ LangGraph recursionLimit（节点转移上限） */
    resolveRecursionLimit: (input) => {
      const forwarded = readReactAgentForwardedProps(input)
      return clampMaxSteps(forwarded.maxSteps ?? REACT_AGENT_MAX_STEPS_DEFAULT)
    },
  },
  dev: {
    description: '开发演示：澄清分流 → 天气 / 订单 ReAct / HITL approval',
    resolveStreamInput: (input) => {
      const resume = resolveResumeFromRunAgentInput(input)
      if (resume != null)
        return new Command({ resume })
      const userText = extractLastUserMessage(input, {
        stateKeys: ['input', 'message'],
        defaultMessage: '开始演示',
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
  editor: {
    description: '文本编辑器（editorPath=job 润色/⌘K；chat 为 Ask/Write 对话）',
    resolveStreamInput: (input) => {
      const userText = extractLastUserMessage(input, {
        stateKeys: ['originalMarkdown'],
        defaultMessage: '',
      })
      if (userText.trim())
        return buildMessagesInput(userText)
      return { messages: [] }
    },
    resolveConfigurable: (input) => {
      const forwarded = input.forwardedProps as { editorPath?: unknown } | undefined
      const editorPath = forwarded?.editorPath === 'job' ? 'job' as const : 'chat' as const
      const state = input.state as {
        writerMode?: unknown
        editCase?: unknown
        polishInstruction?: unknown
        documentBaseline?: unknown
        focuses?: unknown
        forceIntent?: unknown
      } | undefined

      const forceIntent = state?.forceIntent === 'ask' || state?.forceIntent === 'write'
        ? state.forceIntent
        : undefined
      const polishInstruction = typeof state?.polishInstruction === 'string'
        ? state.polishInstruction
        : undefined
      const documentBaseline = typeof state?.documentBaseline === 'string'
        ? state.documentBaseline
        : undefined

      if (editorPath === 'chat') {
        return {
          editorPath,
          reasoning: true,
          editCase: 'document' as const,
          writerMode: 'polish' as const,
          ...(forceIntent ? { forceIntent } : {}),
          ...(documentBaseline ? { documentBaseline } : {}),
          ...(polishInstruction ? { polishInstruction } : {}),
          ...(Array.isArray(state?.focuses) ? { focuses: state.focuses } : {}),
        }
      }

      const editCase = state?.editCase === 'inline' || state?.editCase === 'document'
        ? state.editCase
        : state?.writerMode === 'inline' ? 'inline' : 'document'
      return {
        editorPath,
        reasoning: false,
        editCase,
        writerMode: editCase === 'inline' ? 'inline' : 'polish',
        ...(polishInstruction ? { polishInstruction } : {}),
        ...(documentBaseline ? { documentBaseline } : {}),
        ...(Array.isArray(state?.focuses) ? { focuses: state.focuses } : {}),
      }
    },
  },
  kb: {
    description: '知识库 RAG（混合召回 + rerank + 引文溯源）',
    resolveStreamInput: input => buildMessagesInput(extractLastUserMessage(input, {
      stateKeys: ['message'],
      defaultMessage: '知识库中有哪些退款政策？',
    })),
    resolveConfigurable: (input) => {
      const forwarded = input.forwardedProps as { kbId?: unknown } | undefined
      const raw = forwarded?.kbId
      const kbId = typeof raw === 'string' && raw.trim()
        ? raw.trim()
        : env.KB_COLLECTION
      return { kbId }
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
  const agent = new GraphTransformerAguiAgent(
    { agentId: name, description: definition.description },
    input => streamGraphAguiEvents(
      input,
      getAguiGraphApp(name),
      getGraphAgentStreamOptions(name),
      name,
    ),
  )
  if (name === 'reactAgent')
    attachResolveAgentConfigMiddleware(agent)
  return agent
}

export const copilotAgents = Object.fromEntries(
  (Object.keys(Graphs) as GraphsName[]).map(name => [name, createGraphAgent(name)]),
) as Record<GraphsName, GraphTransformerAguiAgent>

/** 供薄 SSE 旁路复用与 createGraphAgent 相同的 resolve* 选项 */
export function getGraphAgentStreamOptions(name: GraphsName): StreamGraphAguiOptions {
  const definition = GRAPH_AGENT_DEFINITIONS[name]
  const resolveConfigurable = 'resolveConfigurable' in definition
    ? definition.resolveConfigurable
    : undefined
  const resolveRecursionLimit = 'resolveRecursionLimit' in definition
    ? definition.resolveRecursionLimit
    : undefined
  return {
    resolveStreamInput: definition.resolveStreamInput,
    ...(resolveConfigurable ? { resolveConfigurable } : {}),
    ...(resolveRecursionLimit ? { resolveRecursionLimit } : {}),
  }
}
