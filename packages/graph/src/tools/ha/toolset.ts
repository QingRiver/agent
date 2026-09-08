import type { HaMcp } from '@agent/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import process from 'node:process'
import { createHaMcp } from '@agent/tools'
import { ChatOpenAI } from '@langchain/openai'
import { ASK_TOOLS } from '../ask-tools'
import { mcpToolsToLangchainTools } from '../mcpToLangchain'

export interface HaToolset {
  tools: StructuredToolInterface[]
  llmWithTools: ReturnType<ChatOpenAI['bindTools']>
}

export async function buildHaToolset(mcp: HaMcp): Promise<HaToolset> {
  const tools = [
    ...mcpToolsToLangchainTools(mcp),
    ...ASK_TOOLS,
  ]
  const llm = new ChatOpenAI({
    model: process.env.OPENAI_MODEL ?? '',
    temperature: 0,
  })
  const llmWithTools = llm.bindTools(tools)
  return { tools, llmWithTools }
}

/**
 * 懒加载 HA MCP 工具集：首次调用才连接（避免模块加载期强依赖 HA_URL / HA_TOKEN）。
 * 失败时重置 promise，允许后续重试建连。
 */
let toolsetPromise: Promise<HaToolset> | null = null

export async function getHaToolset(): Promise<HaToolset> {
  if (!toolsetPromise) {
    toolsetPromise = createHaMcp().then(buildHaToolset)
    toolsetPromise.catch(() => {
      toolsetPromise = null
    })
  }
  return toolsetPromise
}
