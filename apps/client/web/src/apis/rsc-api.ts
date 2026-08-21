import { getStoredToken } from './auth-client'

/**
 * 拉取 RSC Flight 流（text/x-component）。
 * 不走 hc/successData（后者会 json() 消费 body）。
 */
export async function fetchRscStream(body: { source?: string } = {}): Promise<ReadableStream<Uint8Array>> {
  const token = getStoredToken()
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token)
    headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch('/api/rsc/render', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = await res.json() as { error?: string }
      if (j.error)
        detail = j.error
    }
    catch { /* ignore */ }
    throw new Error(`RSC render failed (${res.status}): ${detail}`)
  }

  const ct = res.headers.get('Content-Type') ?? ''
  if (!ct.includes('text/x-component'))
    throw new Error(`unexpected Content-Type: ${ct || '(empty)'}`)

  if (!res.body)
    throw new Error('RSC response missing body')

  return res.body
}
