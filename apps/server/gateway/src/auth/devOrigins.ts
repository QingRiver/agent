/** better-auth：按 host 通配，不限协议与端口 */
export const DEV_TRUSTED_HOSTS = [
  'localhost:*',
  '127.0.0.1:*',
  'dev.com:*',
] as const

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])

export function isDevTrustedOrigin(origin: string | undefined | null): boolean {
  if (!origin)
    return false
  try {
    return LOOPBACK_HOSTS.has(new URL(origin).hostname)
  }
  catch {
    return false
  }
}

/** Hono CORS：匹配则回显请求的 Origin */
export function resolveDevCorsOrigin(origin: string | undefined): string | null {
  if (origin && isDevTrustedOrigin(origin))
    return origin
  return null
}
