import type { Context, Next } from 'hono'
import { createCopilotRuntimeHandler } from '@copilotkit/runtime/v2'
import { copilotRuntime } from './runtime'

const BASE_PATH = '/copilotkit'

const handler = createCopilotRuntimeHandler({
  runtime: copilotRuntime as never,
  basePath: BASE_PATH,
  cors: {
    origin: ['https://localhost:5173', 'http://localhost:5173'],
    credentials: true,
  },
})

function buildCopilotFetchRequest(ctx: Context): Request {
  return new Request(ctx.req.url, ctx.req.raw)
}

export async function copilotKitMiddleware(ctx: Context, next: Next): Promise<Response | void> {
  if (!ctx.req.path.startsWith(BASE_PATH))
    return next()

  try {
    return await handler(buildCopilotFetchRequest(ctx))
  }
  catch (err) {
    console.error('[copilotkit]', err)
    return ctx.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    )
  }
}
