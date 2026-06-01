import type { Context, Next } from 'koa'
import { simpleGraphApp } from '../graphs/simpleGraph'
import { Controller, Get } from '../router/decorator'
import { createSseStream, streamSimpleGraphSse } from '../utils/sse'

@Controller('/sample')
export class SampleController {
  @Get('/simpleGraph')
  async simpleGraph(ctx: Context, next: Next) {
    const result = await simpleGraphApp.invoke({ messages: [] })
    ctx.body = result
    await next()
  }

  @Get('/simpleGraph/sse')
  async simpleGraphSse(ctx: Context) {
    ctx.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    ctx.status = 200

    const graphStream = await simpleGraphApp.stream(
      { messages: [] },
      { streamMode: 'updates' },
    )

    ctx.body = createSseStream(streamSimpleGraphSse(graphStream))
  }
}
