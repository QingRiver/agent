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

async function connectClient(url: URL, token: string): Promise<{ client: Client, transport: { close: () => Promise<void> } }> {
  const client = new Client({ name: 'agent-cli', version: '0.0.0' })
  const { streamable, sse } = createTransports(url, token)

  try {
    await client.connect(streamable as Parameters<Client['connect']>[0])
    return { client, transport: streamable }
  }
  catch (streamableError) {
    try {
      await streamable.close()
    }
    catch {
      // ignore close errors while falling back
    }

    try {
      await client.connect(sse as Parameters<Client['connect']>[0])
      return { client, transport: sse }
    }
    catch (sseError) {
      await sse.close().catch(() => undefined)
      const streamableMsg = streamableError instanceof Error ? streamableError.message : String(streamableError)
      const sseMsg = sseError instanceof Error ? sseError.message : String(sseError)
      throw new Error(`连接 Tushare MCP 失败（Streamable HTTP: ${streamableMsg}; SSE: ${sseMsg}）`)
    }
  }
}

async function createTushareMcp(): Promise<TushareMcp> {
  const token = tokenOrThrow()
  const url = mcpUrl()
  const { client, transport } = await connectClient(url, token)
  const listed = await client.listTools()
  const tools = listed.tools as McpTool[]

  return {
    tools,
    callTool: async (name, args) => {
      const result = await client.callTool({ name, arguments: args })
      return formatCallToolResult(result as Parameters<typeof formatCallToolResult>[0])
    },
    close: async () => {
      await client.close()
      await transport.close()
    },
  }
}

export { createTushareMcp, TOKEN_HINT }
