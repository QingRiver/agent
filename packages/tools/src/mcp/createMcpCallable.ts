import type { McpTool } from './tushareClient'
import process from 'node:process'
import { Client } from '@modelcontextprotocol/sdk/client'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp'

/**
 * 通用 MCP 客户端面（与 TushareMcp / HaMcp 同形）。
 * 规范化此类型，供 skill 声明的 MCP 物化、tushare/HA 客户端复用。
 */
export interface McpCallable {
  tools: McpTool[]
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>
  close: () => Promise<void>
}

export interface McpCallableConfig {
  /** 完整 URL，可含 `${token}` 占位符；与 `urlEnv` 二选一 */
  url?: string
  /** 从 process.env[urlEnv] 取 base URL；与 `url` 二选一（HA 等动态地址） */
  urlEnv?: string
  /** urlEnv 模式下追加的路径，如 "/api/mcp" */
  urlSuffix?: string
  /** 从 process.env[tokenEnv] 取 token，替换 url/headers 里的 `${token}` */
  tokenEnv?: string
  /** 额外 headers，值可含 `${token}` 占位符 */
  headers?: Record<string, string>
  /** 对 GET 返回 405（绕 SSE 长连接，Tushare 需要） */
  postOnlyGet?: boolean
  clientName?: string
  opTimeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 25_000

function formatCallToolResult(result: {
  isError?: boolean
  content?: Array<{
    type: string
    text?: string
    data?: string
    mimeType?: string
    resource?: { text?: string, blob?: string }
  }>
}): string {
  const parts: string[] = []
  for (const item of result.content ?? []) {
    if (item.type === 'text' && item.text)
      parts.push(item.text)
    else if (item.type === 'resource' && item.resource?.text)
      parts.push(item.resource.text)
    else if (item.type === 'image' || item.type === 'audio')
      parts.push(`[${item.type}: ${item.mimeType ?? 'binary'}]`)
  }
  const body = parts.join('\n').trim()
  if (result.isError)
    return body ? `错误: ${body}` : '工具调用失败'
  return body || '(无返回内容)'
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms),
    ),
  ])
}

/** 按 postOnlyGet 构造 fetch：对 GET 回 405，绕 SSE 长连接。 */
function makeFetch(postOnlyGet: boolean): typeof fetch | undefined {
  if (!postOnlyGet)
    return undefined
  return (input, init) => {
    const method = (
      init?.method
      ?? (input instanceof Request ? input.method : undefined)
      ?? 'GET'
    ).toUpperCase()
    if (method === 'GET')
      return Promise.resolve(new Response(null, { status: 405, statusText: 'Method Not Allowed' }))
    return fetch(input as RequestInfo | URL, init)
  }
}

function resolveToken(config: McpCallableConfig): string | undefined {
  if (!config.tokenEnv)
    return undefined
  const token = process.env[config.tokenEnv]?.trim()
  if (!token)
    throw new Error(`请在环境变量设置 ${config.tokenEnv}`)
  return token
}

function substitute(template: string, token: string | undefined): string {
  // eslint-disable-next-line no-template-curly-in-string -- '${token}' 是 mcp.json 占位符字面量
  return token != null ? template.replaceAll('${token}', token) : template
}

/**
 * 按 config 连接 Streamable HTTP MCP，返回 McpCallable。
 * token 仅从环境取，永不进 skill 声明/bundle。连接失败抛错。
 */
export async function createMcpCallable(config: McpCallableConfig): Promise<McpCallable> {
  const token = resolveToken(config)
  // url 解析：优先 url 字面量，否则 urlEnv + urlSuffix
  let url: string
  if (config.url) {
    url = substitute(config.url, token)
  }
  else if (config.urlEnv) {
    const base = process.env[config.urlEnv]?.trim()
    if (!base)
      throw new Error(`请在环境变量设置 ${config.urlEnv}`)
    url = `${base}${config.urlSuffix ?? ''}`
  }
  else {
    throw new Error('MCP 声明需提供 url 或 urlEnv')
  }
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(config.headers ?? {}))
    headers[k] = substitute(v, token)
  const timeoutMs = config.opTimeoutMs ?? DEFAULT_TIMEOUT_MS
  const client = new Client({ name: config.clientName ?? 'agent-mcp', version: '0.0.0' })
  const fetchFn = makeFetch(config.postOnlyGet === true)
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers },
    ...(fetchFn ? { fetch: fetchFn } : {}),
  })

  try {
    await withTimeout(
      client.connect(transport as Parameters<Client['connect']>[0]),
      timeoutMs,
      `MCP Streamable HTTP 连接 (${url})`,
    )
  }
  catch (err) {
    await transport.close().catch(() => undefined)
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`连接 MCP 失败（${url}: ${msg}）`)
  }

  const listed = await withTimeout(client.listTools(), timeoutMs, 'MCP listTools')
  const tools = listed.tools as McpTool[]

  return {
    tools,
    callTool: async (name, args) => {
      const result = await withTimeout(
        client.callTool({ name, arguments: args }),
        timeoutMs,
        `MCP callTool ${name}`,
      )
      return formatCallToolResult(result as Parameters<typeof formatCallToolResult>[0])
    },
    close: async () => {
      await client.close()
      await transport.close()
    },
  }
}
