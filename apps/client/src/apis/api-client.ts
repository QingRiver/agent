import type { AppType } from '@server/api'
import type { ClientResponse } from 'hono/client'
import { hc } from 'hono/client'
import { getStoredToken } from './auth-client'

export const api = hc<AppType>('/api', {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const token = getStoredToken()
    const headers = new Headers(init?.headers)
    // FormData 必须由浏览器自带 multipart boundary；强行 json 会导致服务端 parseBody 空字段 → 400
    const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData
    if (!headers.has('Content-Type') && !isFormData)
      headers.set('Content-Type', 'application/json')
    if (token)
      headers.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, headers })
  },
})

type FilterClientResponseByStatusCode<
  T extends ClientResponse<unknown, number>,
  U extends number,
> = T extends ClientResponse<infer Body, infer Status, infer Format>
  ? Status extends U ? ClientResponse<Body, Status, Format> : never
  : never

type SuccessBody<R extends ClientResponse<unknown, number>>
  = FilterClientResponseByStatusCode<R, 200> extends ClientResponse<infer Body, 200, infer _>
    ? Body
    : never

function isOK<R extends ClientResponse<unknown, number>>(
  res: R,
): asserts res is FilterClientResponseByStatusCode<R, 200> {
  if (res.status !== 200)
    throw new Error(res.statusText || `Request failed: ${res.status}`)
}

/** 非 200 抛错；返回 200 响应体。 */
export async function successData<R extends ClientResponse<unknown, number>>(
  res: R,
): Promise<SuccessBody<R>> {
  isOK(res)
  return await res.json() as SuccessBody<R>
}
