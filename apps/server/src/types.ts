import type { Http2Bindings } from '@hono/node-server'

/** Hono 应用环境：Node HTTP/2 绑定，供 logger / 心跳读取 ALPN 等 */
export interface AppEnv {
  Bindings: Http2Bindings
}
