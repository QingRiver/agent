import type { SyncRequest, SyncResponse } from '@agent/gtd'
import { api, successData } from './api-client'

export class GtdApi {
  static async sync(body: SyncRequest): Promise<SyncResponse> {
    const res = await api.gtd.sync.$post({ json: body })
    return await successData(res)
  }
}
