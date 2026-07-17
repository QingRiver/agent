import type { GtdDocument } from '@agent/gtd'
import { validateInvariants } from '@agent/gtd'
import { HTTPException } from 'hono/http-exception'
import { DrizzleGtdRepository } from '../gtd/repository'

const repo = new DrizzleGtdRepository()

export class GtdService {
  static async getDocument(userId: string): Promise<GtdDocument> {
    return repo.loadDocument(userId)
  }

  static async saveDocument(userId: string, document: GtdDocument): Promise<void> {
    const violations = validateInvariants(document)
    if (violations.length > 0) {
      const msg = violations.map(v => v.message).join('; ')
      throw new HTTPException(400, { message: msg })
    }
    await repo.saveDocument(userId, document)
  }
}
