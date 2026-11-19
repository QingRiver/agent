import type { SyncRequest } from '@agent/gtd'
import type { Context } from 'hono'
import type { AppEnv, AuthUser } from '../types'
import { syncGtd } from '../gtd/txn-log'

/** GTD 同步：POST /gtd/sync */
export async function syncGtdHandler(c: Context<AppEnv>, user: AuthUser, req: SyncRequest) {
  return c.json(await syncGtd(user.id, req))
}
