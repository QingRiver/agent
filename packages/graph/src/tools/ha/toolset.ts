import type { McpCallable } from '@agent/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { getBuiltInSkill, loadBuiltInSkills } from '@agent/skills/node'
import { createMcpCallable } from '@agent/tools'
import { ASK_TOOLS } from '../ask-tools'
import { mcpToolsToLangchainTools } from '../mcpToLangchain'

export interface HaToolset {
  tools: StructuredToolInterface[]
}

export async function buildHaToolset(mcp: McpCallable): Promise<HaToolset> {
  return {
    tools: [
      ...mcpToolsToLangchainTools(mcp),
      ...ASK_TOOLS,
    ],
  }
}

/**
 * 从 home-assistant skill 的 mcp 声明（`mcp/ha.mcp.json`）连接 MCP。
 * url 取 HA_URL + urlSuffix "/api/mcp"；token 取 HA_TOKEN 作 Bearer。
 */
async function createHaMcpFromSkill(): Promise<McpCallable> {
  await loadBuiltInSkills()
  const bundle = getBuiltInSkill('home_assistant')
  const decl = bundle?.mcp[0]
  if (!decl)
    throw new Error('home-assistant skill 未声明 MCP（mcp/ha.mcp.json）')
  return createMcpCallable({
    ...(decl.urlEnv ? { urlEnv: decl.urlEnv } : {}),
    ...(decl.urlSuffix ? { urlSuffix: decl.urlSuffix } : {}),
    ...(decl.url ? { url: decl.url } : {}),
    ...(decl.tokenEnv ? { tokenEnv: decl.tokenEnv } : {}),
    ...(decl.headers ? { headers: decl.headers } : {}),
    ...(decl.postOnlyGet ? { postOnlyGet: true } : {}),
    clientName: 'skill-ha',
  })
}

/**
 * 懒加载 HA MCP 工具集：首次调用才连接（避免模块加载期强依赖 HA_URL / HA_TOKEN）。
 * 失败时重置 promise，允许后续重试建连。
 */
let toolsetPromise: Promise<HaToolset> | null = null

export async function getHaToolset(): Promise<HaToolset> {
  if (!toolsetPromise) {
    toolsetPromise = createHaMcpFromSkill().then(buildHaToolset)
    toolsetPromise.catch(() => {
      toolsetPromise = null
    })
  }
  return toolsetPromise
}
