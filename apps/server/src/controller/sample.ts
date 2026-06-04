import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { buildMessagesInput, simpleGraphApp, weatherGraphApp } from '../agent'
import { devThreadConfig } from '../graphs/memoryCheckpointer'
import { Controller, Get } from '../router/decorator'
import { createSseResponse } from '../utils/sse'

@Controller('/sample')
export class SampleController {
  @Get('/simpleGraph')
  async simpleGraph(c: Context<AppEnv>): Promise<Response> {
    return c.json(await simpleGraphApp.invoke({ messages: [] }, devThreadConfig()))
  }

  @Get('/simpleGraph/sse')
  async simpleGraphSse(_c: Context<AppEnv>): Promise<Response> {
    const stream = await simpleGraphApp.stream(
      { messages: [] },
      { ...devThreadConfig(), streamMode: 'updates' },
    )
    return createSseResponse(stream)
  }

  @Get('/weather')
  async weather(c: Context<AppEnv>): Promise<Response> {
    const message = c.req.query('message') ?? '北京今天天气怎么样？'

    const stream = await weatherGraphApp.stream(
      buildMessagesInput(message),
      { ...devThreadConfig(), streamMode: 'updates' },
    )
    return createSseResponse(stream)
  }
}
