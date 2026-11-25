import type { SkillBundle } from '@agent/skills/node'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { join, relative, resolve } from 'node:path'
import { createMcpCallable } from '@agent/tools'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { mcpToolsToLangchainTools } from '../tools/mcpToLangchain'

/**
 * 把 skill 声明的工具（`tools/*.tool.json` 脚本 + `mcp/*.mcp.json` MCP）物化成 LangChain 工具。
 *
 * - 脚本工具：spawn `node <skillDir>/<run>`（run 指向 `.mts`/`.mjs`，Node 24+ 直接剥离 TS 类型），stdin 传 JSON args，stdout 作返回。
 *   脚本路径必须落在 skill 目录内（防越界）。
 * - MCP 工具：按声明连接（token 从环境取），listTools 后逐个包装。
 *   连接失败（如 token 未设）跳过该声明并告警，不拖崩整个 agent。
 *
 * Phase 2：机制就位；当前内置 skill 未声明工具，返回空数组，reactAgent 行为不变。
 * Phase 3：weather 脚本化 / tushare MCP 内置后生效。
 */
export async function materializeSkillTools(bundles: SkillBundle[]): Promise<StructuredToolInterface[]> {
  const out: StructuredToolInterface[] = []
  for (const bundle of bundles) {
    for (const decl of bundle.tools)
      out.push(makeScriptTool(bundle, decl))
    for (const decl of bundle.mcp) {
      out.push(...await makeMcpTools(bundle.code, decl).catch((err) => {
        console.warn(`[materializeSkillTools] MCP ${bundle.code}/${decl.id} 跳过：`, err instanceof Error ? err.message : err)
        return []
      }))
    }
  }
  return out
}

function makeScriptTool(
  bundle: SkillBundle,
  decl: { name: string, description: string, inputSchema: { type: 'object', properties?: Record<string, unknown>, required?: string[] }, run: string },
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: decl.name,
    description: decl.description,
    schema: decl.inputSchema,
    func: async input => runSkillScript(bundle.dir, decl.run, input as Record<string, unknown>),
  })
}

async function makeMcpTools(
  skillCode: string,
  decl: { id: string, url?: string, urlEnv?: string, urlSuffix?: string, tokenEnv?: string, headers?: Record<string, string>, postOnlyGet?: boolean },
): Promise<StructuredToolInterface[]> {
  const mcp = await createMcpCallable({
    ...(decl.url ? { url: decl.url } : {}),
    ...(decl.urlEnv ? { urlEnv: decl.urlEnv } : {}),
    ...(decl.urlSuffix ? { urlSuffix: decl.urlSuffix } : {}),
    ...(decl.tokenEnv ? { tokenEnv: decl.tokenEnv } : {}),
    ...(decl.headers ? { headers: decl.headers } : {}),
    ...(decl.postOnlyGet ? { postOnlyGet: true } : {}),
    clientName: `skill-${skillCode}-${decl.id}`,
  })
  return mcpToolsToLangchainTools(mcp)
}

/** spawn 执行 skill 脚本；越界 / 失败消化为字符串，不抛（避免 ToolNode 中断流）。 */
function runSkillScript(skillDir: string, runPath: string, args: Record<string, unknown>): Promise<string> {
  return new Promise((done) => {
    const scriptPath = resolve(join(skillDir, runPath))
    if (relative(skillDir, scriptPath).startsWith('..')) {
      done(`错误：脚本路径越界（${runPath}）`)
      return
    }
    const child = spawn('node', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Uint8Array) => {
      stdout += Buffer.from(chunk).toString()
    })
    child.stderr.on('data', (chunk: Uint8Array) => {
      stderr += Buffer.from(chunk).toString()
    })
    child.on('error', err => done(`脚本执行失败：${err.message}`))
    child.on('close', (code) => {
      if (code !== 0) {
        done(`脚本退出码 ${code}：${stderr.trim() || stdout.trim()}`)
        return
      }
      done(stdout.trim() || '(无输出)')
    })
    child.stdin.end(JSON.stringify(args))
  })
}
