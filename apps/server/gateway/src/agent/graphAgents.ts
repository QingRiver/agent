import type { GraphsName } from '@agent/graph'
import { env } from '@agent/env'
import {
  Graphs,
  sanitizeKbId,
  setSkillFileLoader,
} from '@agent/graph'
import { HumanMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { getCheckpointer } from '../db/checkpointer'
import { SkillService } from '../service/skill'
import { lastHumanText } from './langgraphWire'
import { resolveReactAgentRun } from './middleware/resolveAgentConfig'

setSkillFileLoader(async ({ userId, skillCode }) => SkillService.walkFiles(userId, skillCode))

export interface GraphInvokeRequest {
  messages: ReadonlyArray<{ type?: string, content?: unknown }>
  command?: { resume: unknown }
  configurable?: Record<string, unknown>
}

interface CompiledGraphApp {
  stream: (
    input: unknown,
    options: {
      streamMode: ['messages', 'updates', 'custom']
      configurable?: Record<string, unknown>
      recursionLimit?: number
    },
  ) => Promise<AsyncIterable<unknown>>
  getState: (config: { configurable: { thread_id: string } }) => Promise<unknown>
}

const GRAPH_DESCRIPTIONS: Record<GraphsName, string> = {
  reactAgent: '通用 ReAct（可配 prompt + ask_* + kb_search，Lab 试验台）',
  dev: '开发演示：澄清分流 → 天气 / 订单 ReAct / HITL approval',
  tushare: 'A股个股分析（Tushare MCP + ask_human 中断）',
  ha: 'Home Assistant（官方 MCP + ask_human 中断）',
  editor: '文本编辑器（editorPath=job 润色/⌘K；chat 为 Ask/Write 对话）',
  kb: '知识库 RAG（混合召回 + rerank + 引文溯源）',
}

const DEFAULT_USER_TEXT: Record<GraphsName, string> = {
  reactAgent: '你好',
  dev: '开始演示',
  tushare: '分析平安银行最近走势',
  ha: '客厅灯现在是什么状态？',
  editor: '',
  kb: '知识库中有哪些退款政策？',
}

export function listGraphAgentCatalog(): { name: GraphsName, description: string }[] {
  return (Object.keys(Graphs) as GraphsName[]).map(name => ({
    name,
    description: GRAPH_DESCRIPTIONS[name],
  }))
}

const graphCache = new Map<GraphsName, CompiledGraphApp>()

export function getGraphApp(name: GraphsName): CompiledGraphApp {
  const cached = graphCache.get(name)
  if (cached)
    return cached

  const compiled = Graphs[name].compile({
    checkpointer: getCheckpointer(),
  }) as unknown as CompiledGraphApp

  graphCache.set(name, compiled)
  return compiled
}

export function resolveGraphInput(name: GraphsName, request: GraphInvokeRequest): unknown {
  if (request.command != null)
    return new Command({ resume: request.command.resume })

  const userText = lastHumanText(request.messages, DEFAULT_USER_TEXT[name])
  if (name === 'editor' && !userText.trim())
    return { messages: [] }
  if (name === 'dev') {
    return {
      input: userText,
      messages: [new HumanMessage(userText)],
    }
  }
  return { messages: [new HumanMessage(userText)] }
}

export async function resolveGraphRunOptions(
  name: GraphsName,
  userId: string | undefined,
  configurable: Record<string, unknown> | undefined,
): Promise<{ configurable: Record<string, unknown>, recursionLimit?: number }> {
  if (name === 'reactAgent')
    return resolveReactAgentRun(userId, configurable)
  if (name === 'kb')
    return { configurable: { kbId: sanitizeKbId(configurable?.kbId, env.KB_COLLECTION) } }
  return { configurable: { ...(configurable ?? {}) } }
}
