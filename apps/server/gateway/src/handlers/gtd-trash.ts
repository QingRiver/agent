import type { Context } from 'hono'
import type { TrashPurgeRequest } from '../../shared/gtd-trash'
import type { AppEnv, AuthUser } from '../types'
import { purgeTrashFromPg } from '../gtd/sync-repository'

export class GtdTrashHandlers {
  static async purge(c: Context<AppEnv>, user: AuthUser, req: TrashPurgeRequest) {
    const res = await purgeTrashFromPg(user.id, req.taskIds)
    return c.json(res)
  }
}
