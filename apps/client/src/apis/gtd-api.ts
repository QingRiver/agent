import type { EntityRow, GtdCommand, GtdMutation, PullResponse, PushResponse } from '@agent/gtd'
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

  /** 在线清空回收站（旁路 SyncEngine / outbox） */
  static async purgeTrash(body: { taskIds: string[] }): Promise<{
    purged: { id: string, name: string }[]
    skipped: { id: string, reason: string }[]
    changes: EntityRow[]
    serverSyncId: number
  }> {
    const res = await api.gtd.trash.purge.$post({ json: body })
    const data = await successData(res)
    return {
      ...data,
      changes: data.changes as EntityRow[],
    }
  }
}
