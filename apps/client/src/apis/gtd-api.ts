import type { GtdCommand, GtdMutation, PullResponse, PushResponse } from '@agent/gtd'
import { api, successData } from './api-client'

export class GtdApi {
  static async syncPush(body: { mutations: GtdMutation[], commands: GtdCommand[], lastSyncId: number }): Promise<PushResponse> {
    const res = await api.gtd.sync.push.$post({ json: body })
    return await successData(res)
  }

  static async syncPull(body: { lastSyncId: number }): Promise<PullResponse> {
    const res = await api.gtd.sync.pull.$post({ json: body })
    return await successData(res)
  }
}
