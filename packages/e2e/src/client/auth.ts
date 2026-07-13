import type { E2EOptions } from './config'
import { configureE2ETls, E2E_ACCOUNT, E2E_BASE_URL, E2E_DEV_ORIGIN } from './config'

/**
 * E2E 认证客户端：登录、建号、带 bearer 的 JSON fetch 与请求头构造。
 *
 * 设计：所有方法都自动 `configureE2ETls()`（放行自签证书），
 * 并统一注入 `Origin`（better-auth trustedOrigins / CORS）。
 * flows 与 support 层只调用这里的函数，不再各自拼 fetch。
 */

/** 构造 JSON + Origin 请求头（登录/建号等无 token 的请求用） */
function jsonHeaders(): Headers {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  headers.set('Origin', E2E_DEV_ORIGIN)
  return headers
}

/**
 * 登录 E2E 账号，返回 bearer token。
 * @throws 缺失 token 或非 2xx 时抛错。
 */
export async function signInE2E(opts: E2EOptions = {}): Promise<string> {
  configureE2ETls()
  const baseUrl = opts.baseUrl ?? E2E_BASE_URL
  const res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email: E2E_ACCOUNT.email, password: E2E_ACCOUNT.password }),
  })
  const data = await res.json() as { token?: string, message?: string }
  if (!res.ok || !data.token)
    throw new Error(`E2E sign-in 失败 (${res.status}): ${data.message ?? JSON.stringify(data)}`)
  return data.token
}

/**
 * 幂等创建 E2E 账号（已存在则忽略）。
 * 多数场景无需调用——`pnpm devops e2e auth` 已完成建号；
 * 仅供无 server 端访问权限的外部服务自举用。
 */
export async function ensureE2eAccount(opts: E2EOptions = {}): Promise<void> {
  configureE2ETls()
  const baseUrl = opts.baseUrl ?? E2E_BASE_URL
  try {
    const res = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(E2E_ACCOUNT),
    })
    if (res.ok)
      return
    const data = await res.json().catch(() => ({})) as { message?: string }
    const msg = (data.message ?? '').toLowerCase()
    if (msg.includes('exist') || msg.includes('already'))
      return
    throw new Error(`E2E sign-up 失败 (${res.status}): ${data.message ?? 'unknown'}`)
  }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.toLowerCase().includes('exist') || msg.toLowerCase().includes('already'))
      return
    throw error
  }
}

/** 构造带 bearer + Origin 的请求头（JSON 与 SSE 原始 fetch 均可复用） */
export function e2eHeaders(token: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Origin', E2E_DEV_ORIGIN)
  return headers
}

/**
 * 认证 JSON fetch：自动注入 bearer/Origin/Content-Type，非 2xx 抛错并带响应体。
 * @example const list = await e2eFetch<{ conversations: T[] }>(token, '/conversations/list')
 */
export async function e2eFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  configureE2ETls()
  const headers = e2eHeaders(token, init.headers)
  if (init.body && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json')

  const res = await fetch(`${E2E_BASE_URL}${path}`, { ...init, headers })
  const text = await res.text()
  if (!res.ok)
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 500)}`)

  try {
    return JSON.parse(text) as T
  }
  catch {
    throw new Error(`${path} 响应非 JSON: ${text.slice(0, 200)}`)
  }
}
