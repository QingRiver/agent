import type { Context } from 'hono'
import type { TLSSocket } from 'node:tls'
import type { AppEnv } from '../types'
import { Controller, Get } from '../router/decorator'
import { Debug } from '../utils/debug'

@Controller('')
export class DefaultController {
  @Get('/')
  @Get('/heartbeat')
  async hello(c: Context<AppEnv>): Promise<Response> {
    const socket = c.env.incoming.socket as TLSSocket | undefined
    return c.json({
      message: `Heartbeat Path:${c.req.path}`,
      timestamp: new Date().toISOString(),
      protocol: socket?.alpnProtocol || 'http/1.1',
    })
  }

  @Debug({
    breakpointOnEnter: true,
    when(args) {
      const ctx = args[0] as Context<AppEnv>
      return ctx.req.query('debug') === '1'
    },
  })
  @Get('/:param')
  async param(c: Context<AppEnv>): Promise<Response> {
    return c.json({
      message: `RouterHander Path:${c.req.path}`,
      timestamp: new Date().toISOString(),
      params: c.req.param('param'),
    })
  }
}
