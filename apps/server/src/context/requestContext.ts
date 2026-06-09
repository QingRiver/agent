import type { CheckpointerMode } from '../db/checkpointer'
import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestContext {
  mode: CheckpointerMode
  userId?: string | undefined
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T | Promise<T>): T | Promise<T> {
  return storage.run(ctx, fn)
}

export function getRequestContext(): RequestContext {
  return storage.getStore() ?? { mode: 'guest' }
}
