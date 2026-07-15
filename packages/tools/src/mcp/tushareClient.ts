import process from 'node:process'
import { Client } from '@modelcontextprotocol/sdk/client'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp'

const TOKEN_HINT = '请在环境变量设置 TUSHARE_TOKEN（tushare.pro 用户中心获取）'
const TUSHARE_MCP_BASE = 'https://api.tushare.pro/mcp/token='

export interface McpTool {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, object>
    required?: string[]
    [key: string]: unknown
  }
}

export interface TushareMcp {
  tools: McpTool[]
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>
  close: () => Promise<void>
}

function tokenOrThrow(): string {
  const token = process.env.TUSHARE_TOKEN?.trim()
  if (!token)
    throw new Error(TOKEN_HINT)
  return token
}

function mcpUrl(): URL {
  return new URL(`${TUSHARE_MCP_BASE}${tokenOrThrow()}`)
}

function mcpAuthHeaders(token: string): HeadersInit {
  return {
    'Authorization': `Bearer ${token}`,
    'X-Tushare-Token': token,
  }
}

function createTransports(url: URL, token: string): {
  streamable: StreamableHTTPClientTransport
  sse: SSEClientTransport
} {
  const headers = mcpAuthHeaders(token)
  return {
    streamable: new StreamableHTTPClientTransport(url, {
      requestInit: { headers },
    }),
    sse: new SSEClientTransport(url, {
      requestInit: { headers },
      eventSourceInit: {
        fetch: (input, init) => fetch(input, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string> | undefined),
            ...(headers as Record<string, string>),
          },
        }),
      },
    }),
  }
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

/**
 * MCP SDK 的 connect/listTools 的 fetch 无内置超时，tushare 服务偶发不响应时会永久 hang。
 * 此处统一加超时：超时即 reject（transport.close() 会 abort 底层 fetch），让上层 toolsetPromise 重置、可重试。
 */
const MCP_OP_TIMEOUT_MS = 15_000

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
): Promise<{ client: Client, transport: { close: () => Promise<void> } }> {
  const client = new Client({ name: 'agent-mcp', version: '0.0.0' })
  const { streamable, sse } = createTransports(url, token)

  try {
    await withTimeout(
      client.connect(streamable as Parameters<Client['connect']>[0]),
      MCP_OP_TIMEOUT_MS,
      'Tushare MCP Streamable HTTP 连接',
    )
    return { client, transport: streamable }
  }
  catch (streamableError) {
    // close 会触发 transport 内部 abortController，中断仍 hang 的 fetch
    try {
      await streamable.close()
    }
    catch {
      // ignore close errors while falling back
    }

    try {
      await withTimeout(
        client.connect(sse as Parameters<Client['connect']>[0]),
        MCP_OP_TIMEOUT_MS,
        'Tushare MCP SSE 连接',
      )
      return { client, transport: sse }
    }
    catch (sseError) {
      await sse.close().catch(() => undefined)
      const streamableMsg = streamableError instanceof Error
        ? streamableError.message
        : String(streamableError)
      const sseMsg = sseError instanceof Error ? sseError.message : String(sseError)
      throw new Error(
        `连接 Tushare MCP 失败（Streamable HTTP: ${streamableMsg}; SSE: ${sseMsg}）`,
      )
    }
  }
}

async function createTushareMcp(): Promise<TushareMcp> {
  const token = tokenOrThrow()
  const url = mcpUrl()
  const { client, transport } = await connectClient(url, token)

  const listStart = Date.now()
  console.log(`[tushare-mcp] listTools 发起 ts=${new Date(listStart).toISOString()} url=${url.host} timeout=${MCP_OP_TIMEOUT_MS}ms`)
  let listed
  try {
    listed = await withTimeout(
      client.listTools(),
      MCP_OP_TIMEOUT_MS,
      'Tushare MCP listTools',
    )
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`[tushare-mcp] listTools 失败 elapsed=${Date.now() - listStart}ms err=${msg}`)
    throw err
  }
  console.log(`[tushare-mcp] listTools 成功 elapsed=${Date.now() - listStart}ms count=${listed.tools.length}`)
  const tools = listed.tools as McpTool[]

  return {
    tools,
    callTool: async (name, args) => {
      const start = Date.now()
      const argsStr = JSON.stringify(args)
      console.log(`[tushare-mcp] callTool 发起 ts=${new Date(start).toISOString()} name=${name} args=${argsStr.slice(0, 200)}${argsStr.length > 200 ? `…(+${argsStr.length - 200})` : ''}`)
      try {
        const result = await client.callTool({ name, arguments: args })
        const out = formatCallToolResult(result as Parameters<typeof formatCallToolResult>[0])
        console.log(`[tushare-mcp] callTool 完成 name=${name} elapsed=${Date.now() - start}ms isError=${result.isError === true} len=${out.length}`)
        return out
      }
      catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`[tushare-mcp] callTool 失败 name=${name} elapsed=${Date.now() - start}ms err=${msg}`)
        throw err
      }
    },
    close: async () => {
      await client.close()
      await transport.close()
    },
  }
}

export { createTushareMcp, TOKEN_HINT }
