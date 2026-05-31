import type { Context, Next } from 'koa'
import type { TLSSocket } from 'node:tls'
import { Debug } from '../utils/debug'
import { Controller, Get } from '../router/decorator'

@Controller('')
export class DefaultController {

  @Get('/')
  @Get('/heartbeat')
  async hello(ctx: Context, next: Next): Promise<void> {
    ctx.body = {
      message: `Heartbeat Path:${ctx.path}`,
      timestamp: new Date().toISOString(),
      protocol: (ctx.req.socket as TLSSocket).alpnProtocol || 'http/1.1',
    }
    await next()
  }

  @Debug({
    breakpointOnEnter: true,
    when(args) {
      const ctx = args[0] as Context
      return ctx.query?.debug === '1'
    },
  })
  @Get('/:param')
  async param(ctx: Context, next: Next): Promise<void> {
    ctx.body = {
      message: `RouterHander Path:${ctx.path}`,
      timestamp: new Date().toISOString(),
      params: ctx.params.param,
    }
    await next()
  }
}
