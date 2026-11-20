import type { ApplyRequest, GtdRowsResponse } from '@agent/gtd'
import { api, successData } from './api-client'

export class GtdApi {
  static async list(): Promise<GtdRowsResponse> {
    const res = await api.gtd.list.$post()
    return await successData(res)
  }

  static async apply(body: ApplyRequest): Promise<GtdRowsResponse> {
    const res = await api.gtd.apply.$post({ json: body })
    return await successData(res)
  }
}
