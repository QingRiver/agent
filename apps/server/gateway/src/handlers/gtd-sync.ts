import type { SyncRequest } from '@agent/gtd'
import type { Context } from 'hono'
import type { AppEnv, AuthUser } from '../types'
import { syncGtd } from '../gtd/txn-log'

/** GTD 同步 HTTP handler：POST /gtd/sync。 */
export class GtdSyncHandlers {
  static async sync(c: Context<AppEnv>, user: AuthUser, req: SyncRequest) {
    return c.json(await syncGtd(user.id, req))
  }
}
