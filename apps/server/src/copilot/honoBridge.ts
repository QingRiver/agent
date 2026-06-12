import type { Context, Next } from 'hono'
import { createCopilotRuntimeHandler } from '@copilotkit/runtime/v2'
import { getAuth } from '../auth/auth'
import { resolveDevCorsOrigin } from '../auth/devOrigins'
import { runWithRequestContext } from '../context/requestContext'
import { assertThreadOwnedByUser } from '../conversation/threadGuard'
import { copilotRuntime } from './runtime'

const BASE_PATH = '/copilotkit'

const handler = createCopilotRuntimeHandler({
  runtime: copilotRuntime as never,
  basePath: BASE_PATH,
  cors: {
    origin: resolveDevCorsOrigin,
    credentials: true,
  },
})

function buildCopilotFetchRequest(ctx: Context): Request {
  return new Request(ctx.req.url, ctx.req.raw)
}

async function resolveCopilotSession(headers: Headers): Promise<
  | { userId: string }
  | Response
> {
  const session = await getAuth().api.getSession({ headers })
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { userId: session.user.id }
}

function extractThreadId(body: unknown): string | undefined {
  if (body == null || typeof body !== 'object')
    return undefined
  const o = body as Record<string, unknown>
  if (typeof o.threadId === 'string')
    return o.threadId
  const input = o.input
  if (input != null && typeof input === 'object' && typeof (input as { threadId?: string }).threadId === 'string')
    return (input as { threadId: string }).threadId
  return undefined
}

async function assertCopilotThreadAccess(
  request: Request,
  userId: string,
): Promise<Response | null> {
  if (request.method !== 'POST')
    return null

  let body: unknown
  try {
    body = await request.clone().json()
  }
  catch {
    return null
  }

  const threadId = extractThreadId(body)
  if (!threadId)
    return null

  if (!assertThreadOwnedByUser(userId, threadId)) {
    return new Response(JSON.stringify({ error: 'Forbidden: thread not owned by user' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return null
}

export async function copilotKitMiddleware(ctx: Context, next: Next): Promise<Response | void> {
  if (!ctx.req.path.startsWith(BASE_PATH))
    return next()

  const resolved = await resolveCopilotSession(ctx.req.raw.headers)
  if (resolved instanceof Response)
    return resolved

  const { userId } = resolved

  const denied = await assertCopilotThreadAccess(ctx.req.raw, userId)
  if (denied)
    return denied

  return runWithRequestContext({ userId }, async () => {
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
