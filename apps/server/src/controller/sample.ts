import type { Context } from 'koa'
import { simpleGraphApp } from '../graphs/simpleGraph'
import { buildWeatherInput, weatherGraphApp } from '../graphs/weatherGraph'
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

  @Get('/weather')
  async weather(ctx: Context) {
    const message = typeof ctx.query.message === 'string' && ctx.query.message
      ? ctx.query.message
      : '北京今天天气怎么样？'

    ctx.body = await weatherGraphApp.stream(
      buildWeatherInput(message),
      { streamMode: 'updates' },
    )
  }
}
