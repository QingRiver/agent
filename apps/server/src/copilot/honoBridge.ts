import type { Context, Next } from 'hono'
import type { CheckpointerMode } from '../graphs/checkpointer'
import { createCopilotRuntimeHandler } from '@copilotkit/runtime/v2'
import { getAuth } from '../auth/auth'
import { runWithRequestContext } from '../context/requestContext'
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

async function resolveCheckpointerMode(headers: Headers): Promise<{
  mode: CheckpointerMode
  userId?: string
}> {
  const session = await getAuth().api.getSession({ headers })
  if (!session)
    return { mode: 'guest' }
  return { mode: 'auth', userId: session.user.id }
}

export async function copilotKitMiddleware(ctx: Context, next: Next): Promise<Response | void> {
  if (!ctx.req.path.startsWith(BASE_PATH))
    return next()

  const { mode, userId } = await resolveCheckpointerMode(ctx.req.raw.headers)

  return runWithRequestContext({ mode, userId }, async () => {
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
  })
}
