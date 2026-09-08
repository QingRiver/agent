import type { McpTool } from './tushareClient'
import process from 'node:process'
import { Client } from '@modelcontextprotocol/sdk/client'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp'

const URL_HINT = '请在环境变量设置 HA_URL（Home Assistant 根地址，如 https://homeassistant.local:8123）'
const TOKEN_HINT = '请在环境变量设置 HA_TOKEN（Home Assistant Long-Lived Access Token）'

export interface HaMcp {
  tools: McpTool[]
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>
  close: () => Promise<void>
}

function haUrlOrThrow(): URL {
  const raw = process.env.HA_URL?.trim()
  if (!raw)
    throw new Error(URL_HINT)
  let base: URL
  try {
    base = new URL(raw)
  }
  catch {
    throw new Error(`${URL_HINT}（当前值不是合法 URL）`)
  }
  return new URL('/api/mcp', base)
}

function haTokenOrThrow(): string {
  const token = process.env.HA_TOKEN?.trim()
  if (!token)
    throw new Error(TOKEN_HINT)
  return token
}

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

/** MCP SDK 的 fetch 无内置超时；超时即 reject，close() 会 abort 底层请求以便重试。 */
const MCP_OP_TIMEOUT_MS = 25_000

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms),
    ),
  ])
}

async function connectClient(
  url: URL,
  token: string,
): Promise<{ client: Client, transport: StreamableHTTPClientTransport }> {
  const client = new Client({ name: 'agent-ha-mcp', version: '0.0.0' })
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })

  try {
    await withTimeout(
      client.connect(transport as Parameters<Client['connect']>[0]),
      MCP_OP_TIMEOUT_MS,
      'HA MCP Streamable HTTP 连接',
    )
    return { client, transport }
  }
  catch (err) {
    await transport.close().catch(() => undefined)
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`连接 Home Assistant MCP 失败（Streamable HTTP: ${msg}）`)
  }
}

async function createHaMcp(): Promise<HaMcp> {
  const token = haTokenOrThrow()
  const url = haUrlOrThrow()
  const { client, transport } = await connectClient(url, token)

  const listStart = Date.now()
  console.log(`[ha-mcp] listTools 发起 ts=${new Date(listStart).toISOString()} url=${url.href} timeout=${MCP_OP_TIMEOUT_MS}ms`)
  let listed
  try {
    listed = await withTimeout(
      client.listTools(),
      MCP_OP_TIMEOUT_MS,
      'HA MCP listTools',
    )
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`[ha-mcp] listTools 失败 elapsed=${Date.now() - listStart}ms err=${msg}`)
    await client.close().catch(() => undefined)
    await transport.close().catch(() => undefined)
    throw err
  }
  console.log(`[ha-mcp] listTools 成功 elapsed=${Date.now() - listStart}ms count=${listed.tools.length}`)
  const tools = listed.tools as McpTool[]

  return {
    tools,
    callTool: async (name, args) => {
      const start = Date.now()
      const argsStr = JSON.stringify(args)
      console.log(`[ha-mcp] callTool 发起 ts=${new Date(start).toISOString()} name=${name} args=${argsStr.slice(0, 200)}${argsStr.length > 200 ? `…(+${argsStr.length - 200})` : ''}`)
      try {
        const result = await client.callTool({ name, arguments: args })
        const out = formatCallToolResult(result as Parameters<typeof formatCallToolResult>[0])
        console.log(`[ha-mcp] callTool 完成 name=${name} elapsed=${Date.now() - start}ms isError=${result.isError === true} len=${out.length}`)
        return out
      }
      catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`[ha-mcp] callTool 失败 name=${name} elapsed=${Date.now() - start}ms err=${msg}`)
        throw err
      }
    },
    close: async () => {
      await client.close()
      await transport.close()
    },
  }
}

export { createHaMcp, TOKEN_HINT as HA_TOKEN_HINT, URL_HINT as HA_URL_HINT }
