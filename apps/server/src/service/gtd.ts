import type { GtdDocument } from '@agent/gtd'
import { dematerialize, RowStore, validateInvariants } from '@agent/gtd'
import { HTTPException } from 'hono/http-exception'
import { DrizzleGtdRepository } from '../gtd/repository'

const repo = new DrizzleGtdRepository()

export class GtdService {
  static async getDocument(userId: string): Promise<GtdDocument> {
    return repo.loadDocument(userId)
  }

  /**
   * @deprecated saveDocument 废止日常用途；仅保留导入/灾难修复。
   * 日常同步走 POST /gtd/sync/push（applyPushToPg）。
   */
  static async saveDocument(userId: string, document: GtdDocument): Promise<void> {
    const violations = validateInvariants(new RowStore(dematerialize(document, userId)))
    if (violations.length > 0) {
      const msg = violations.map(v => v.message).join('; ')
      throw new HTTPException(400, { message: msg })
    }
    await repo.saveDocument(userId, document)
  }
}
