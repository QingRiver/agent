import type { GtdDocument } from '@agent/gtd'
import { api, successData } from './api-client'

export class GtdApi {
  static async getDocument(): Promise<GtdDocument> {
    const res = await api.gtd.document.get.$post()
    return (await successData(res)).document
  }

  static async saveDocument(document: GtdDocument): Promise<void> {
    const res = await api.gtd.document.save.$post({ json: { document } })
    await successData(res)
  }
}
