import type { PullRequest, PushRequest } from '@agent/gtd'
import type { Context } from 'hono'
import type { AppEnv, AuthUser } from '../types'
import { applyPushToPg, pullFromPg } from '../gtd/sync-repository'

/** GTD sync HTTP handler：POST /gtd/sync/pull|push。 */
export class GtdSyncHandlers {
  static async push(c: Context<AppEnv>, user: AuthUser, req: PushRequest) {
    const res = await applyPushToPg(user.id, req)
    return c.json(res)
  }

  static async pull(c: Context<AppEnv>, user: AuthUser, req: PullRequest) {
    const res = await pullFromPg(user.id, req.lastSyncId)
    return c.json(res)
  }
}
