import process from 'node:process'
import { sleep } from 'radash'

const TUSHARE_API = 'https://api.tushare.pro'
const TUSHARE_TIMEOUT_MS = 10_000
const MIN_REQUEST_INTERVAL_MS = 125 // ~8 req/s

export interface StockBasicRow {
  ts_code: string
  symbol: string
  name: string
  area: string
  industry: string
  list_date: string
}

export interface DailyRow {
  ts_code: string
  trade_date: string
  open: number
  high: number
  low: number
  close: number
  pre_close: number
  change: number
  pct_chg: number
  vol: number
  amount: number
}

export interface RealtimeQuoteRow {
  ts_code: string
  name: string
  price: number
  pre_close: number
  change: number
  pct_chg: number
  vol: number
  amount: number
}

interface TushareData {
  fields: string[]
  items: unknown[][]
}

interface TushareResponse {
  code: number
  msg: string | null
  data: TushareData | null
}

const STOCK_BASIC_FIELDS = 'ts_code,symbol,name,area,industry,list_date'
const DAILY_FIELDS = 'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount'
const REALTIME_FIELDS = 'ts_code,name,price,pre_close,change,pct_chg,vol,amount'

let lastRequestAt = 0

function tokenOrThrow(): string {
  const token = process.env.TUSHARE_TOKEN
  if (!token)
    throw new Error('请在环境变量设置 TUSHARE_TOKEN（tushare.pro 用户中心获取）')
  return token
}

function withTimeout<T>(promise: Promise<T>, ms = TUSHARE_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    sleep(ms).then(() => {
      throw new Error(`Tushare 请求超时（${ms / 1000}s）`)
    }),
  ])
}

async function throttle(): Promise<void> {
  const now = Date.now()
  const wait = MIN_REQUEST_INTERVAL_MS - (now - lastRequestAt)
  if (wait > 0)
    await sleep(wait)
  lastRequestAt = Date.now()
}

function rowsFromData<T>(data: TushareData): T[] {
  return data.items.map((item) => {
    const row: Record<string, unknown> = {}
    for (let i = 0; i < data.fields.length; i++)
      row[data.fields[i]!] = item[i]
    return row as T
  })
}

async function query<T>(
  api_name: string,
  params: Record<string, unknown>,
  fields: string,
): Promise<T[]> {
  await throttle()

  const body = {
    api_name,
    token: tokenOrThrow(),
    params,
    fields,
  }

  const response = await withTimeout(fetch(TUSHARE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))

  if (!response.ok)
    throw new Error(`Tushare HTTP 错误: ${response.status}`)

  const json = await response.json() as TushareResponse
  if (json.code !== 0)
    throw new Error(json.msg ?? `Tushare 业务错误 code=${json.code}`)

  if (!json.data?.items.length)
    return []

  return rowsFromData<T>(json.data)
}

export function formatRowsAsText(
  rows: ReadonlyArray<object>,
  options?: { maxRows?: number },
): string {
  const maxRows = options?.maxRows ?? 30
  const slice = rows.slice(0, maxRows)
  if (slice.length === 0)
    return '（无数据）'

  const lines = slice.map((row, i) => {
    const parts = Object.entries(row).map(([k, v]) => `${k}: ${v}`)
    return `${i + 1}. ${parts.join(', ')}`
  })

  if (rows.length > maxRows)
    lines.push(`（仅展示前 ${maxRows} 条，共 ${rows.length} 条）`)

  return lines.join('\n')
}

async function getStockBasic(params: {
  ts_code?: string
  name?: string
  list_status?: string
}): Promise<StockBasicRow[]> {
  const apiParams: Record<string, unknown> = {
    list_status: params.list_status ?? 'L',
  }
  if (params.ts_code)
    apiParams.ts_code = params.ts_code
  if (params.name)
    apiParams.name = params.name

  return query<StockBasicRow>('stock_basic', apiParams, STOCK_BASIC_FIELDS)
}

async function getDaily(params: {
  ts_code: string
  start_date?: string
  end_date?: string
  trade_date?: string
}): Promise<DailyRow[]> {
  const apiParams: Record<string, unknown> = { ts_code: params.ts_code }
  if (params.start_date)
    apiParams.start_date = params.start_date
  if (params.end_date)
    apiParams.end_date = params.end_date
  if (params.trade_date)
    apiParams.trade_date = params.trade_date

  const rows = await query<DailyRow>('daily', apiParams, DAILY_FIELDS)
  return rows.sort((a, b) => b.trade_date.localeCompare(a.trade_date))
}

async function getRealtimeQuote(params: { ts_code: string }): Promise<RealtimeQuoteRow[]> {
  return query<RealtimeQuoteRow>('realtime_quote', { ts_code: params.ts_code }, REALTIME_FIELDS)
}

export const tushare = {
  query,
  formatRowsAsText,
  getStockBasic,
  getDaily,
  getRealtimeQuote,
}
