import type { GraphsName } from '@agent/graph'
import { env } from '@agent/env'
import { sanitizeKbId } from '@agent/graph'
import { HumanMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { lastHumanText } from './langgraphWire'
import { resolveReactAgentRun } from './middleware/resolveAgentConfig'

export interface GraphInvokeRequest {
  messages: ReadonlyArray<{ type?: string, content?: unknown }>
  command?: { resume: unknown }
  configurable?: Record<string, unknown>
}

export interface GraphRunOptions {
  configurable: Record<string, unknown>
  recursionLimit?: number
}

type BuildInput = (req: GraphInvokeRequest) => unknown
type ResolveRun = (
  userId: string | undefined,
  configurable: Record<string, unknown> | undefined,
) => Promise<GraphRunOptions>

export interface GraphRegistration {
  description: string
  defaultUserText: string
  buildInput: BuildInput
  resolveRun: ResolveRun
}

function messagesInput(defaultText: string): BuildInput {
  return (req) => {
    const userText = lastHumanText(req.messages, defaultText)
    return { messages: [new HumanMessage(userText)] }
  }
}

function passthroughRun(): ResolveRun {
  return async (_userId, configurable) => ({
    configurable: { ...(configurable ?? {}) },
  })
}

const reactAgentText = '你好'
const devText = '开始演示'
const tushareText = '分析平安银行最近走势'
const haText = '客厅灯现在是什么状态？'
const kbText = '知识库中有哪些退款政策？'

export const graphRegistry: Record<GraphsName, GraphRegistration> = {
  reactAgent: {
    description: '通用 ReAct（可配 prompt + ask_* + kb_search，Lab 试验台）',
    defaultUserText: reactAgentText,
    buildInput: messagesInput(reactAgentText),
    resolveRun: resolveReactAgentRun,
  },
  dev: {
    description: '开发演示：澄清分流 → 天气 / 订单 ReAct / HITL approval',
    defaultUserText: devText,
    buildInput: (req) => {
      const userText = lastHumanText(req.messages, devText)
      return {
        input: userText,
        messages: [new HumanMessage(userText)],
      }
    },
    resolveRun: passthroughRun(),
  },
  tushare: {
    description: 'A股个股分析（Tushare MCP + ask_human 中断）',
    defaultUserText: tushareText,
    buildInput: messagesInput(tushareText),
    resolveRun: passthroughRun(),
  },
  ha: {
    description: 'Home Assistant（官方 MCP + ask_human 中断）',
    defaultUserText: haText,
    buildInput: messagesInput(haText),
    resolveRun: passthroughRun(),
  },
  editor: {
    description: '文本编辑器（editorPath=job 润色/⌘K；chat 为 Ask/Write 对话）',
    defaultUserText: '',
    buildInput: (req) => {
      const userText = lastHumanText(req.messages, '')
      if (!userText.trim())
        return { messages: [] }
      return { messages: [new HumanMessage(userText)] }
    },
    resolveRun: passthroughRun(),
  },
  kb: {
    description: '知识库 RAG（混合召回 + rerank + 引文溯源）',
    defaultUserText: kbText,
    buildInput: messagesInput(kbText),
    resolveRun: async (_userId, configurable) => ({
      configurable: {
        kbId: sanitizeKbId(configurable?.kbId, env.KB_COLLECTION),
      },
    }),
  },
}

export function resolveGraphInput(name: GraphsName, request: GraphInvokeRequest): unknown {
  if (request.command != null)
    return new Command({ resume: request.command.resume })
  return graphRegistry[name].buildInput(request)
}

export function resolveGraphRunOptions(
  name: GraphsName,
  userId: string | undefined,
  configurable: Record<string, unknown> | undefined,
): Promise<GraphRunOptions> {
  return graphRegistry[name].resolveRun(userId, configurable)
}

export function listGraphAgentCatalog(): { name: GraphsName, description: string }[] {
  return (Object.keys(graphRegistry) as GraphsName[]).map(name => ({
    name,
    description: graphRegistry[name].description,
  }))
}
