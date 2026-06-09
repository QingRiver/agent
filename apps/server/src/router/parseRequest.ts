import type { Context } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from '../types'
import type { RequestSchemaMeta } from './decorator'
import { formatSseError } from '../utils/sse'

function validationError(c: Context<AppEnv>, error: z.ZodError): Response {
  return c.json({ error: formatSseError(error) }, 400)
}

async function readJsonBody(c: Context<AppEnv>): Promise<unknown | Response> {
  try {
    return await c.req.json()
  }
  catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }
}

function readQueryInput(c: Context<AppEnv>): Record<string, string> {
  return Object.fromEntries(new URL(c.req.url).searchParams.entries())
}

/** 按 meta 解析并校验请求；失败时返回 400 Response */
export async function parseValidatedRequest(
  c: Context<AppEnv>,
  meta: RequestSchemaMeta,
): Promise<unknown | Response> {
  const raw = meta.source === 'query'
    ? readQueryInput(c)
    : await readJsonBody(c)
  if (raw instanceof Response)
    return raw

  const parsed = meta.schema.safeParse(raw)
  if (!parsed.success)
    return validationError(c, parsed.error)
  return parsed.data
}
