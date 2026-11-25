import type { TushareMcp } from '@agent/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { getBuiltInSkill, loadBuiltInSkills } from '@agent/skills/node'
import { createMcpCallable } from '@agent/tools'
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
 * 从 tushare skill 的 mcp 声明（`mcp/tushare.mcp.json`）连接 MCP。
 * 替代原 createTushareMcp 硬编码：url/token/postOnlyGet 等配置内置于 skill，token 从 TUSHARE_TOKEN 环境取。
 */
async function createTushareMcpFromSkill(): Promise<TushareMcp> {
  await loadBuiltInSkills()
  const bundle = getBuiltInSkill('tushare')
  const decl = bundle?.mcp[0]
  if (!decl)
    throw new Error('tushare skill 未声明 MCP（mcp/tushare.mcp.json）')
  return createMcpCallable({
    ...(decl.url ? { url: decl.url } : {}),
    ...(decl.tokenEnv ? { tokenEnv: decl.tokenEnv } : {}),
    ...(decl.headers ? { headers: decl.headers } : {}),
    ...(decl.postOnlyGet ? { postOnlyGet: true } : {}),
    clientName: 'skill-tushare',
  }) as unknown as TushareMcp
}

/**
 * 懒加载 MCP 工具集：首次调用才连接 Tushare MCP（避免模块加载期强依赖 TUSHARE_TOKEN）。
 * 失败时重置 promise，允许后续重试建连。
 */
let toolsetPromise: Promise<TushareToolset> | null = null

export async function getTushareToolset(): Promise<TushareToolset> {
  if (!toolsetPromise) {
    toolsetPromise = createTushareMcpFromSkill().then(buildTushareToolset)
    toolsetPromise.catch(() => {
      toolsetPromise = null
    })
  }
  return toolsetPromise
}
