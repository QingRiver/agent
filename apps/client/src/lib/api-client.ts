import type { AppType } from '@server/api'
import { hc } from 'hono/client'
import { getStoredToken } from './auth-client'

export const api = hc<AppType>('/api', {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const token = getStoredToken()
    const headers = new Headers(init?.headers)
    if (!headers.has('Content-Type'))
      headers.set('Content-Type', 'application/json')
    if (token)
      headers.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, headers })
  },
})

export async function throwIfApiError(res: Response): Promise<void> {
  if (res.ok)
    return
  const data: unknown = await res.json().catch(() => ({}))
  const msg = typeof data === 'object' && data != null && 'error' in data
    ? String((data as { error: unknown }).error)
    : res.statusText
  throw new Error(msg || `Request failed: ${res.status}`)
}
