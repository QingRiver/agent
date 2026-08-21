import type { Context, Next } from 'hono'
import type { TLSSocket } from 'node:tls'
import type { AppEnv } from '../types'
import { createMiddleware } from 'hono/factory'
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

function formatRequestUrl(c: Context<AppEnv>): string {
  const url = new URL(c.req.url)
  if (!url.search)
    return url.pathname

  const search = [...url.searchParams.entries()]
    .flatMap(([key, value]) => [`${key}=${value}`])
    .join('&')

  return `${url.pathname}?${search}`
}

function alpnProtocol(c: Context<AppEnv>): string {
  const socket = c.env.incoming.socket as TLSSocket | undefined
  return socket?.alpnProtocol || 'http/1.1'
}

export const logger = createMiddleware<AppEnv>(async (c: Context<AppEnv>, next: Next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  const method = colorMethod(c.req.method)
  const latency = colorLatency(ms)
  console.log(`${method} ${formatRequestUrl(c)} - ${latency} - Protocol: ${alpnProtocol(c)}`)
})
