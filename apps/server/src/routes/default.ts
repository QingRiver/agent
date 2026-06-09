import type { Context } from 'hono'
import type { TLSSocket } from 'node:tls'
import type { AppEnv } from '../types'
import { Hono } from 'hono'

function heartbeat(c: Context<AppEnv>) {
  const socket = c.env.incoming.socket as TLSSocket | undefined
  return c.json({
    message: `Heartbeat Path:${c.req.path}`,
    timestamp: new Date().toISOString(),
    protocol: socket?.alpnProtocol || 'http/1.1',
  })
}

export const defaultRoutes = new Hono<AppEnv>()
  .get('/', heartbeat)
  .get('/heartbeat', heartbeat)
  .get('/:param', (c) => {
    if (c.req.query('debug') === '1') {
      // eslint-disable-next-line no-debugger
      debugger
    }
    return c.json({
      message: `RouterHander Path:${c.req.path}`,
      timestamp: new Date().toISOString(),
      params: c.req.param('param'),
    })
  })
