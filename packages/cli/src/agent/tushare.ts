import type { StockBasicRow } from '@agent/tools'
import type { ToolDef, UI } from '@core/types'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tushare } from '@agent/tools'
import { interact } from '@core/agent-effect'
import { Effect } from 'effect'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TUSHARE_SYSTEM_PROMPT = readFileSync(
  join(__dirname, 'prompts/tushare.md'),
  'utf8',
).trim()

const TOKEN_HINT = '请在环境变量设置 TUSHARE_TOKEN（tushare.pro 用户中心获取）'

function formatYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function defaultDailyRange(): { start_date: string, end_date: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 130) // 约 90 个交易日，供月 K 聚合
  return { start_date: formatYmd(start), end_date: formatYmd(end) }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function toolErrorMessage(err: unknown): string {
  if (err instanceof Error)
    return err.message
  return String(err)
}

function pickStock(stocks: StockBasicRow[]) {
  return Effect.gen(function* () {
    if (stocks.length === 0)
      return null
    if (stocks.length === 1)
      return stocks[0]!

    const r = yield* interact({
      type: 'select',
      message: '匹配到多只股票，请选择:',
      options: stocks.map(s => ({
        label: `${s.name} (${s.ts_code})`,
        value: s.ts_code,
        description: s.industry,
      })),
    })
    const ts_code = (r.payload as { value: string }).value
    return stocks.find(s => s.ts_code === ts_code) ?? null
  })
}

function pickOptionalString(args: Record<string, unknown>, key: string): { [k: string]: string } {
  const value = asString(args[key])
  return value ? { [key]: value } : {}
}

function resolveTsCode(args: Record<string, unknown>): Effect.Effect<Record<string, unknown> | null, never, UI> {
  return Effect.gen(function* () {
    let ts_code = asString(args.ts_code)
    const name = asString(args.name)

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
        args = { ...args, name: input }
    }

    if (ts_code)
      return { ...args, ts_code }

    const searchName = asString(args.name)
    if (!searchName)
      return null

    let stocks: StockBasicRow[]
    try {
      stocks = yield* Effect.promise(() =>
        tushare.getStockBasic({ name: searchName }),
      )
    }
    catch {
      return null
    }

    const picked = yield* pickStock(stocks)
    if (!picked)
      return null

    return { ...args, ts_code: picked.ts_code, name: picked.name }
  })
}

const getStockBasicTool: ToolDef = {
  schema: {
    type: 'function',
    function: {
      name: 'get_stock_basic',
      description: '查询 A 股股票基础信息（代码、名称、行业、上市日期等）',
      parameters: {
        type: 'object',
        properties: {
          ts_code: { type: 'string', description: 'TS 代码，如 000001.SZ' },
          name: { type: 'string', description: '股票名称，支持模糊匹配' },
          list_status: { type: 'string', description: '上市状态，默认 L（上市）' },
        },
      },
    },
  },

  execute: (args: Record<string, unknown>) => Effect.gen(function* () {
    let resolved = { ...args }
    const ts_code = asString(resolved.ts_code)
    const name = asString(resolved.name)

    if (!ts_code && !name) {
      const r = yield* interact({
        type: 'input',
        message: '请输入要查询的股票名称或代码:',
        placeholder: '平安银行',
      })
      const input = (r.payload as { value: string }).value.trim()
      if (input.includes('.'))
        resolved = { ...resolved, ts_code: input }
      else
        resolved = { ...resolved, name: input }
    }
    else if (!ts_code && name) {
      const stocks = yield* Effect.promise(() =>
        tushare.getStockBasic({ name }),
      ).pipe(Effect.match({ onFailure: () => null as StockBasicRow[] | null, onSuccess: s => s }))
      if (!stocks)
        return '查询股票基础信息失败'
      const picked = yield* pickStock(stocks)
      if (!picked)
        return '未选择股票'
      resolved = { ...resolved, ts_code: picked.ts_code, name: picked.name }
    }

    return yield* Effect.promise(() =>
      tushare.getStockBasic({
        ...pickOptionalString(resolved, 'ts_code'),
        ...pickOptionalString(resolved, 'name'),
        ...pickOptionalString(resolved, 'list_status'),
      }),
    ).pipe(
      Effect.match({
        onFailure: err => toolErrorMessage(err),
        onSuccess: rows => tushare.formatRowsAsText(rows, { maxRows: 10 }),
      }),
    )
  }),
}

const getDailyTool: ToolDef = {
  schema: {
    type: 'function',
    function: {
      name: 'get_daily',
      description: '查询 A 股历史日线行情（开高低收、涨跌幅、成交量等）',
      parameters: {
        type: 'object',
        properties: {
          ts_code: { type: 'string', description: 'TS 代码，如 000001.SZ' },
          name: { type: 'string', description: '股票名称（无 ts_code 时用于解析）' },
          start_date: { type: 'string', description: '开始日期 YYYYMMDD' },
          end_date: { type: 'string', description: '结束日期 YYYYMMDD' },
          trade_date: { type: 'string', description: '单日查询 YYYYMMDD' },
        },
      },
    },
  },

  execute: (args: Record<string, unknown>) => Effect.gen(function* () {
    const resolved = yield* resolveTsCode(args)
    if (!resolved)
      return TOKEN_HINT

    const merged = { ...args, ...resolved }
    let start_date = asString(merged.start_date)
    let end_date = asString(merged.end_date)
    const trade_date = asString(merged.trade_date)

    if (!trade_date && (!start_date || !end_date)) {
      const defaults = defaultDailyRange()
      start_date = start_date ?? defaults.start_date
      end_date = end_date ?? defaults.end_date
    }

    const ts_code = asString(merged.ts_code)
    if (!ts_code)
      return TOKEN_HINT

    return yield* Effect.promise(() =>
      tushare.getDaily({
        ts_code,
        ...pickOptionalString(merged, 'start_date'),
        ...pickOptionalString(merged, 'end_date'),
        ...pickOptionalString(merged, 'trade_date'),
        ...(start_date ? { start_date } : {}),
        ...(end_date ? { end_date } : {}),
        ...(trade_date ? { trade_date } : {}),
      }),
    ).pipe(
      Effect.match({
        onFailure: err => toolErrorMessage(err),
        onSuccess: rows => tushare.formatRowsAsText(rows, { maxRows: 30 }),
      }),
    )
  }),
}

const getRealtimeQuoteTool: ToolDef = {
  schema: {
    type: 'function',
    function: {
      name: 'get_realtime_quote',
      description: '查询 A 股最新快照行情（积分要求较高）',
      parameters: {
        type: 'object',
        properties: {
          ts_code: { type: 'string', description: 'TS 代码，多只用逗号分隔' },
          name: { type: 'string', description: '股票名称（无 ts_code 时用于解析）' },
        },
      },
    },
  },

  execute: (args: Record<string, unknown>) => Effect.gen(function* () {
    const resolved = yield* resolveTsCode(args)
    if (!resolved)
      return TOKEN_HINT

    const ts_code = asString(resolved.ts_code)
    if (!ts_code)
      return TOKEN_HINT

    return yield* Effect.promise(() =>
      tushare.getRealtimeQuote({ ts_code }),
    ).pipe(
      Effect.match({
        onFailure: (err) => {
          const msg = toolErrorMessage(err)
          return `${msg}\n可改用 get_daily 查询最近交易日收盘数据。`
        },
        onSuccess: rows => tushare.formatRowsAsText(rows, { maxRows: 10 }),
      }),
    )
  }),
}

const tushareTools: ToolDef[] = [getStockBasicTool, getDailyTool, getRealtimeQuoteTool]

export { TUSHARE_SYSTEM_PROMPT, tushareTools }
