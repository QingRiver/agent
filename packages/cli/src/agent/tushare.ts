import type { McpTool, TushareMcp } from '@core/mcp/client'
import type { ToolDef } from '@core/types'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { interact } from '@core/agent-effect'
import { mcpToolsToToolDefs } from '@core/mcp/to-tooldef'
import { Effect } from 'effect'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TUSHARE_SYSTEM_PROMPT_TEMPLATE = readFileSync(
  join(__dirname, 'prompts/tushare.md'),
  'utf8',
).trim()

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** 渲染 system prompt，把 `${to_day}` 占位符替换为当日日期（YYYYMMDD），避免模型时间错乱 */
function renderSystemPrompt(): string {
  return TUSHARE_SYSTEM_PROMPT_TEMPLATE.replace(/\$\{to_day\}/g, todayYmd())
}

const TUSHARE_SYSTEM_PROMPT = renderSystemPrompt()

const TOKEN_HINT = '请在环境变量设置 TUSHARE_TOKEN（tushare.pro 用户中心获取）'

const QUERY_TOOL_CANDIDATES = [
  'sdk_call',
  'tushare_query',
  'get_api_query',
  'query',
  'call_api',
]

interface StockCandidate {
  ts_code: string
  name: string
  industry?: string
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function toolErrorMessage(err: unknown): string {
  if (err instanceof Error)
    return err.message
  return String(err)
}

function findStockBasicTool(tools: McpTool[]): McpTool | null {
  return tools.find(tool => tool.name === 'stock_basic') ?? null
}

function findQueryTool(tools: McpTool[]): McpTool | null {
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

function buildStockBasicArgs(tool: McpTool, name?: string, ts_code?: string): Record<string, unknown> {
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
    if (props.params && typeof props.params === 'object')
      args.params = params
    else if (props.params && (props.params as { type?: string }).type === 'string')
      args.params = JSON.stringify(params)
    else
      args.params = params
    return args
  }

  return {
    api_name: 'stock_basic',
    ...params,
  }
}

function extractRows(payload: unknown): Record<string, unknown>[] {
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

function parseStockCandidates(text: string): StockCandidate[] {
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

function pickStock(stocks: StockCandidate[]) {
  return Effect.gen(function* () {
    if (stocks.length === 0)
      return null
    if (stocks.length === 1)
      return stocks[0]!

    const r = yield* interact({
      type: 'select',
      message: '匹配到多只股票，请选择:',
      options: stocks.map((s) => {
        const option = {
          label: `${s.name} (${s.ts_code})`,
          value: s.ts_code,
        }
        return s.industry ? { ...option, description: s.industry } : option
      }),
    })
    const ts_code = (r.payload as { value: string }).value
    return stocks.find(s => s.ts_code === ts_code) ?? null
  })
}

async function queryStockBasic(mcp: TushareMcp, queryTool: McpTool, args: { name?: string, ts_code?: string }): Promise<StockCandidate[]> {
  const result = await mcp.callTool(queryTool.name, buildStockBasicArgs(queryTool, args.name, args.ts_code))
  return parseStockCandidates(result)
}

function createResolveStockTool(mcp: TushareMcp): ToolDef {
  const stockBasicTool = findStockBasicTool(mcp.tools) ?? findQueryTool(mcp.tools)

  return {
    schema: {
      type: 'function',
      function: {
        name: 'resolve_stock',
        description: '解析股票名称或代码为 ts_code。用户只给简称/模糊名称时必须先调用此工具；多匹配时终端会弹出选择列表。',
        parameters: {
          type: 'object',
          properties: {
            ts_code: { type: 'string', description: 'TS 代码，如 000001.SZ' },
            name: { type: 'string', description: '股票名称，支持模糊匹配' },
          },
        },
      },
    },
    risk: 'safe',
    execute: (args: Record<string, unknown>) => Effect.gen(function* () {
      let ts_code = asString(args.ts_code)
      let name = asString(args.name)

      if (!ts_code && !name) {
        const r = yield* interact({
          type: 'input',
          message: '请输入股票名称或代码:',
          placeholder: '平安银行 / 000001.SZ',
        })
        const input = (r.payload as { value: string }).value.trim()
        if (input.includes('.'))
          ts_code = input
        else
          name = input
      }

      if (ts_code) {
        return JSON.stringify({ ts_code, name: name ?? null }, null, 2)
      }

      if (!name)
        return TOKEN_HINT

      if (!stockBasicTool)
        return '未找到 Tushare MCP stock_basic 工具，无法解析股票名称'

      let stocks: StockCandidate[]
      try {
        stocks = yield* Effect.promise(() => queryStockBasic(mcp, stockBasicTool, { name }))
      }
      catch (err) {
        return toolErrorMessage(err)
      }

      const picked = yield* pickStock(stocks)
      if (!picked)
        return stocks.length === 0 ? `未找到名称「${name}」对应的股票` : '未选择股票'

      return JSON.stringify({ ts_code: picked.ts_code, name: picked.name }, null, 2)
    }),
  }
}

function createTushareAgent(mcp: TushareMcp): { tools: ToolDef[], systemPrompt: string } {
  return {
    tools: [...mcpToolsToToolDefs(mcp), createResolveStockTool(mcp)],
    systemPrompt: renderSystemPrompt(),
  }
}

export { createTushareAgent, TUSHARE_SYSTEM_PROMPT }
