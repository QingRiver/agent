import type { Context } from 'koa'
import { simpleGraphApp } from '../graphs/simpleGraph'
import { Controller, Get } from '../router/decorator'

@Controller('/sample')
export class SampleController {
  @Get('/simpleGraph')
  async simpleGraph(ctx: Context) {
    ctx.body = await simpleGraphApp.invoke({ messages: [] })
  }

  @Get('/simpleGraph/sse')
  async simpleGraphSse(ctx: Context) {
    ctx.body = await simpleGraphApp.stream(
      { messages: [] },
      { streamMode: 'updates' },
    )
  }
}
