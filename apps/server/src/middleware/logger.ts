import type { Context, Next } from 'koa'
import type { TLSSocket } from 'node:tls'
import { get } from 'radash'

const RESET = '\x1B[0m'
const GREEN = '\x1B[32m'
const YELLOW = '\x1B[33m'
const BLUE = '\x1B[34m'
const RED = '\x1B[31m'
const CYAN = '\x1B[36m'

const METHOD_COLOR: Record<string, string> = {
  GET: GREEN,
  POST: BLUE,
}

const LATENCY_THRESHOLDS: Array<{ min: number, color: string }> = [
  { min: 100, color: RED },
  { min: 50, color: YELLOW },
  { min: 0, color: GREEN },
]

function colorize(text: string, color: string): string {
  return `${color}${text}${RESET}`
}

function colorMethod(method: string): string {
  return colorize(method, get(METHOD_COLOR, method, CYAN))
}

function colorLatency(ms: number): string {
  const tier = LATENCY_THRESHOLDS.find(({ min }) => ms >= min)!
  return colorize(`${ms}ms`, tier.color)
}

/** 用已解码的 path / query 拼日志 URL，避免 %E6%B7%B1 等编码 */
function formatRequestUrl(ctx: Context): string {
  const entries = Object.entries(ctx.query)
  if (entries.length === 0)
    return ctx.path

  const search = entries
    .flatMap(([key, value]) => {
      if (Array.isArray(value))
        return value.map(v => `${key}=${v}`)
      if (value == null)
        return []
      return [`${key}=${value}`]
    })
    .join('&')

  return search ? `${ctx.path}?${search}` : ctx.path
}

export async function logger(ctx: Context, next: Next) {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  const protocol = (ctx.req.socket as TLSSocket).alpnProtocol || 'http/1.1'
  const method = colorMethod(ctx.method)
  const latency = colorLatency(ms)
  console.log(`${method} ${formatRequestUrl(ctx)} - ${latency} - Protocol: ${protocol}`)
}
