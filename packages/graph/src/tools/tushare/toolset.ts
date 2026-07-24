import type { TushareMcp } from '@agent/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import process from 'node:process'
import { createTushareMcp } from '@agent/tools'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { ChatOpenAI } from '@langchain/openai'
import { ASK_TOOLS } from '../ask-tools'
import { mcpToolsToLangchainTools } from '../mcpToLangchain'
import { createResolveStockTool } from './resolveStock'

export interface TushareToolset {
  tools: StructuredToolInterface[]
  llmWithTools: ReturnType<ChatOpenAI['bindTools']>
  toolNode: ToolNode
}

export async function buildTushareToolset(mcp: TushareMcp): Promise<TushareToolset> {
  const tools = [
    ...mcpToolsToLangchainTools(mcp),
    createResolveStockTool(mcp),
    ...ASK_TOOLS,
  ]
  const llm = new ChatOpenAI({
    model: process.env.OPENAI_MODEL ?? '',
    temperature: 0,
  })
  const llmWithTools = llm.bindTools(tools)
  const toolNode = new ToolNode(tools)
  return { tools, llmWithTools, toolNode }
}

/**
 * 懒加载 MCP 工具集：首次调用才连接 Tushare MCP（避免模块加载期强依赖 TUSHARE_TOKEN）。
 * 失败时重置 promise，允许后续重试建连。
 */
let toolsetPromise: Promise<TushareToolset> | null = null

export async function getTushareToolset(): Promise<TushareToolset> {
  if (!toolsetPromise) {
    toolsetPromise = createTushareMcp().then(buildTushareToolset)
    toolsetPromise.catch(() => {
      toolsetPromise = null
    })
  }
  return toolsetPromise
}
