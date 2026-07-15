import type { McpTool, TushareMcp } from './tushareClient'

/** 股票解析候选（来自 stock_basic / 通用查询） */
export interface StockCandidate {
  ts_code: string
  name: string
  industry?: string
}

/** 通用查询工具候选名（不同 MCP 实现可能暴露不同名字） */
export const QUERY_TOOL_CANDIDATES = [
  'sdk_call',
  'tushare_query',
  'get_api_query',
  'query',
  'call_api',
] as const

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

export function toolErrorMessage(err: unknown): string {
  if (err instanceof Error)
    return err.message
  return String(err)
}

export function findStockBasicTool(tools: McpTool[]): McpTool | null {
  return tools.find(tool => tool.name === 'stock_basic') ?? null
}

export function findQueryTool(tools: McpTool[]): McpTool | null {
  for (const name of QUERY_TOOL_CANDIDATES) {
    const found = tools.find(tool => tool.name === name)
    if (found)
      return found
  }

  return tools.find((tool) => {
    const props = tool.inputSchema.properties as Record<string, unknown> | undefined
    return props != null && 'api_name' in props
  }) ?? null
}

export function buildStockBasicArgs(
  tool: McpTool,
  name?: string,
  ts_code?: string,
): Record<string, unknown> {
  if (tool.name === 'stock_basic') {
    const args: Record<string, unknown> = { list_status: 'L' }
    if (ts_code)
      args.ts_code = ts_code
    if (name)
      args.name = name
    return args
  }

  const props = tool.inputSchema.properties as Record<string, unknown> | undefined
  const params: Record<string, unknown> = {}
  if (ts_code)
    params.ts_code = ts_code
  if (name)
    params.name = name

  if (props && 'api_name' in props) {
    const args: Record<string, unknown> = { api_name: 'stock_basic' }
    const paramsSchema = props.params as { type?: string } | undefined
    // params 形参 schema 为 string 类型时，MCP 期望 JSON 字符串而非对象
    args.params = paramsSchema?.type === 'string' ? JSON.stringify(params) : params
    return args
  }

  return {
    api_name: 'stock_basic',
    ...params,
  }
}

export function extractRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload))
    return payload.filter((row): row is Record<string, unknown> => typeof row === 'object' && row != null)

  if (typeof payload !== 'object' || payload == null)
    return []

  const obj = payload as Record<string, unknown>
  for (const key of ['data', 'items', 'rows', 'result']) {
    const value = obj[key]
    if (Array.isArray(value))
      return value.filter((row): row is Record<string, unknown> => typeof row === 'object' && row != null)
  }

  if (Array.isArray(obj.fields) && Array.isArray(obj.items)) {
    const fields = obj.fields as string[]
    return (obj.items as unknown[][]).map((item) => {
      const row: Record<string, unknown> = {}
      fields.forEach((field, index) => {
        row[field] = item[index]
      })
      return row
    })
  }

  return []
}

export function parseStockCandidates(text: string): StockCandidate[] {
  const trimmed = text.trim()
  if (!trimmed)
    return []

  try {
    const parsed = JSON.parse(trimmed) as unknown
    const rows = extractRows(parsed)
    return rows
      .map((row): StockCandidate | null => {
        const ts_code = asString(row.ts_code)
        const name = asString(row.name)
        if (!ts_code || !name)
          return null
        const candidate: StockCandidate = { ts_code, name }
        const industry = asString(row.industry)
        if (industry)
          candidate.industry = industry
        return candidate
      })
      .filter((row): row is StockCandidate => row != null)
  }
  catch {
    const matches = [...trimmed.matchAll(/(\d{6}\.[A-Z]{2})\s+([^\n,|]+)/g)]
    return matches.map(match => ({
      ts_code: match[1]!,
      name: match[2]!.trim(),
    }))
  }
}

/** 调 stock_basic（或等价通用查询）解析名称/代码 → 候选列表 */
export async function queryStockBasic(
  mcp: TushareMcp,
  queryTool: McpTool,
  args: { name?: string, ts_code?: string },
): Promise<StockCandidate[]> {
  const result = await mcp.callTool(
    queryTool.name,
    buildStockBasicArgs(queryTool, args.name, args.ts_code),
  )
  return parseStockCandidates(result)
}
