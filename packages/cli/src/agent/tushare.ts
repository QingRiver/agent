import type { TushareMcp } from '@core/mcp/client'
import type { ToolDef } from '@core/types'
import {
  asString,
  findQueryTool,
  findStockBasicTool,
  queryStockBasic,
  renderTushareSystemPrompt,
  TOKEN_HINT,
  toolErrorMessage,
  TUSHARE_SYSTEM_PROMPT,
} from '@agent/tools'
import { interact } from '@core/agent-effect'
import { mcpToolsToToolDefs } from '@core/mcp/to-tooldef'
import { Effect } from 'effect'

function pickStock(stocks: { ts_code: string, name: string, industry?: string }[]) {
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

      let stocks: { ts_code: string, name: string, industry?: string }[]
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
    systemPrompt: renderTushareSystemPrompt(),
  }
}

export { createTushareAgent, TUSHARE_SYSTEM_PROMPT }
