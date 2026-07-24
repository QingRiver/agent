import type { StockCandidate, TushareMcp } from '@agent/tools'
import {
  findQueryTool,
  findStockBasicTool,
  queryStockBasic,
  TOKEN_HINT,
  toolErrorMessage,
} from '@agent/tools'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { hitlInput, hitlSelect } from '../hitl/interrupt'

/** 多匹配时弹选择列表（与 CLI pickStock 同语义） */
async function pickStock(stocks: StockCandidate[]): Promise<StockCandidate | null> {
  if (stocks.length === 0)
    return null
  if (stocks.length === 1)
    return stocks[0]!

  const resp = await hitlSelect({
    message: '匹配到多只股票，请选择（也可在末尾自定义输入代码/名称）:',
    options: stocks.map(s => ({
      label: `${s.name} (${s.ts_code})`,
      value: s.ts_code,
      ...(s.industry ? { description: s.industry } : {}),
    })),
  })
  const found = stocks.find(s => s.ts_code === resp.value)
  if (found)
    return found
  // 用户自定义：按原文当作 ts_code（可含名称或 000001.SZ 等形式）
  const custom = resp.value.trim()
  if (!custom)
    return null
  return { ts_code: custom, name: custom }
}

/** resolve_stock：缺名称/代码时 hitlInput；多匹配时 hitlSelect */
export function createResolveStockTool(mcp: TushareMcp) {
  const stockBasicTool = findStockBasicTool(mcp.tools) ?? findQueryTool(mcp.tools)

  return tool(
    async ({ ts_code, name }) => {
      let code = ts_code
      let nm = name

      if (!code && !nm) {
        const resp = await hitlInput({
          message: '请输入股票名称或代码:',
          placeholder: '平安银行 / 000001.SZ',
        })
        const input = resp.value.trim()
        if (input.includes('.'))
          code = input
        else
          nm = input
      }

      if (code)
        return JSON.stringify({ ts_code: code, name: nm ?? null }, null, 2)

      if (!nm)
        return TOKEN_HINT

      if (!stockBasicTool)
        return '未找到 Tushare MCP stock_basic 工具，无法解析股票名称'

      let stocks: StockCandidate[]
      try {
        stocks = await queryStockBasic(mcp, stockBasicTool, { name: nm })
      }
      catch (err) {
        return toolErrorMessage(err)
      }

      const picked = await pickStock(stocks)
      if (!picked)
        return stocks.length === 0 ? `未找到名称「${nm}」对应的股票` : '未选择股票'

      return JSON.stringify({ ts_code: picked.ts_code, name: picked.name }, null, 2)
    },
    {
      name: 'resolve_stock',
      description: '解析股票名称或代码为 ts_code。用户只给简称/模糊名称时必须先调用此工具；多匹配时弹出选择列表（用户也可自定义输入代码/名称）。',
      schema: z.object({
        ts_code: z.string().optional().describe('TS 代码，如 000001.SZ'),
        name: z.string().optional().describe('股票名称，支持模糊匹配'),
      }),
    },
  )
}
