import type { Context } from 'hono'
import type { GtdSaveDocument } from '../../shared/gtd'
import type { AppEnv, AuthUser } from '../types'
import { GtdService } from '../service/gtd'

export class GtdHandlers {
  static async getDocument(c: Context<AppEnv>, user: AuthUser) {
    const document = await GtdService.getDocument(user.id)
    return c.json({ document })
  }

  static async saveDocument(c: Context<AppEnv>, user: AuthUser, req: GtdSaveDocument) {
    await GtdService.saveDocument(user.id, req.document)
    return c.json({ ok: true as const })
  }
}
