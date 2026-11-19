import type { TushareMcp } from '@agent/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { createTushareMcp } from '@agent/tools'
import { ASK_TOOLS } from '../ask-tools'
import { mcpToolsToLangchainTools } from '../mcpToLangchain'
import { createResolveStockTool } from './resolveStock'

export interface TushareToolset {
  tools: StructuredToolInterface[]
}

export async function buildTushareToolset(mcp: TushareMcp): Promise<TushareToolset> {
  return {
    tools: [
      ...mcpToolsToLangchainTools(mcp),
      createResolveStockTool(mcp),
      ...ASK_TOOLS,
    ],
  }
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
