import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { simpleGraphApp } from '../graphs/simpleGraph'
import { buildWeatherInput, weatherGraphApp } from '../graphs/weatherGraph'
import { Controller, Get } from '../router/decorator'
import { createSseResponse } from '../utils/sse'

@Controller('/sample')
export class SampleController {
  @Get('/simpleGraph')
  async simpleGraph(c: Context<AppEnv>): Promise<Response> {
    return c.json(await simpleGraphApp.invoke({ messages: [] }))
  }

  @Get('/simpleGraph/sse')
  async simpleGraphSse(_c: Context<AppEnv>): Promise<Response> {
    const stream = await simpleGraphApp.stream(
      { messages: [] },
      { streamMode: 'updates' },
    )
    return createSseResponse(stream)
  }

  @Get('/weather')
  async weather(c: Context<AppEnv>): Promise<Response> {
    const message = c.req.query('message') ?? '北京今天天气怎么样？'

    const stream = await weatherGraphApp.stream(
      buildWeatherInput(message),
      { streamMode: 'updates' },
    )
    return createSseResponse(stream)
  }
}
