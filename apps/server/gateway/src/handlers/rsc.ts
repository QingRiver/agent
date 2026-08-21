import { env } from '@agent/env'
import { HTTPException } from 'hono/http-exception'

/**
 * 鉴权后把 POST /rsc/render 透传到 rsc-engine（loopback）。
 * 原样 pipe status / Content-Type / body；引擎不可达 → 503。
 */
export const RscHandlers = {
  async render(
    body: { source?: string | undefined },
  ): Promise<Response> {
    const url = `${env.RSC_ENGINE_URL.replace(/\/$/, '')}/render`
    let upstream: Response
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new HTTPException(503, {
        message: `rsc-engine 不可达（${url}）：${msg}`,
      })
    }

    const headers = new Headers()
    const ct = upstream.headers.get('Content-Type')
    if (ct)
      headers.set('Content-Type', ct)

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    })
  },
}
