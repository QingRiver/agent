import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { KbConflictError } from '../service/kb'

/** 存在但非本人 / 不存在 → 404（不可见） */
export function requireOwned<T extends { owner: string | null }>(row: T | null, userId: string): T {
  if (!row || row.owner !== userId)
    throw new HTTPException(404, { message: 'Not found' })
  return row
}

export function notFound(message = 'Not found'): never {
  throw new HTTPException(404, { message })
}

/** Hono onError：HTTPException / KbConflictError → JSON；其余 500 */
export function handleAppError(err: Error, c: Context): Response | Promise<Response> {
  if (err instanceof HTTPException)
    return c.json({ error: err.message }, err.status)
  if (err instanceof KbConflictError)
    return c.json({ error: err.message }, 409)
  console.error('[server]', err)
  return c.json({ error: err.message }, 500)
}
