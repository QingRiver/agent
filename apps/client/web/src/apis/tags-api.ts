import type { InferResponseType } from 'hono/client'
import { api, successData } from './api-client'

type Tags = typeof api.tags

export type TagsListResponse = InferResponseType<Tags['list']['$post'], 200>
export type TagRow = TagsListResponse['tags'][number]

export interface TagDeleteDryRunResult {
  docs: { id: string, title: string }[]
  tasks: { id: string, title: string }[]
  skills: { id: string, title: string }[]
}

export type TagDeleteResult = TagDeleteDryRunResult | { ok: true }

export class TagsApi {
  static async list() {
    const res = await api.tags.list.$post({ json: {} })
    return (await successData(res)).tags
  }

  static async create(body: { name: string, color?: string }) {
    const res = await api.tags.create.$post({ json: body })
    return (await successData(res)).tag
  }

  static async rename(id: string, name: string) {
    const res = await api.tags[':id'].rename.$post({ param: { id }, json: { name } })
    return await successData(res)
  }

  static async updateColor(id: string, color: string | null) {
    const res = await api.tags[':id']['update-color'].$post({ param: { id }, json: { color } })
    return (await successData(res)).tag
  }

  static async deleteTag(
    id: string,
    body: {
      mode: 'untag' | 'delete_entities'
      dryRun?: boolean
      docIds?: string[]
      taskIds?: string[]
      skillIds?: string[]
    },
  ): Promise<TagDeleteResult> {
    const res = await api.tags[':id'].delete.$post({ param: { id }, json: body })
    return await successData(res)
  }
}
