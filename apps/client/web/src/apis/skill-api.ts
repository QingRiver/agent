import type { VersionTextType } from '@agent/proto'
import type { InferResponseType } from 'hono/client'
import { VERSION_TEXT_TYPE } from '@agent/proto'
import { api, successData } from './api-client'

type Skills = typeof api.skills
export type SkillRow = InferResponseType<Skills['list']['$post'], 200>['skills'][number]
export type VersionTextRow = InferResponseType<typeof api['version-texts']['list']['$post'], 200>['versionTexts'][number]

export { VERSION_TEXT_TYPE, type VersionTextType }

export class SkillApi {
  static async list(): Promise<SkillRow[]> {
    const res = await api.skills.list.$post()
    return (await successData(res)).skills
  }

  static async create(body: { dirId: string, code?: string }): Promise<SkillRow> {
    const res = await api.skills.create.$post({ json: body })
    return (await successData(res)).skill
  }

  static async unmark(id: string): Promise<void> {
    const res = await api.skills[':id'].unmark.$post({ param: { id } })
    await successData(res)
  }

  static async setTagIds(id: string, tagIds: string[]): Promise<SkillRow> {
    const res = await api.skills[':id'].tags.$post({ param: { id }, json: { tagIds } })
    return (await successData(res)).skill
  }

  static async listVersionTexts(dirId: string, type?: VersionTextType): Promise<VersionTextRow[]> {
    const res = await api['version-texts'].list.$post({
      json: { dirId, ...(type ? { type } : {}) },
    })
    return (await successData(res)).versionTexts
  }

  static async listAllVersionTexts(type?: VersionTextType): Promise<VersionTextRow[]> {
    const res = await api['version-texts']['list-all'].$post({
      json: type ? { type } : {},
    })
    return (await successData(res)).versionTexts
  }

  static async listVersions(dirId: string, filename: string): Promise<VersionTextRow[]> {
    const res = await api['version-texts']['list-versions'].$post({
      json: { dirId, filename },
    })
    return (await successData(res)).versionTexts
  }

  static async getVersion(dirId: string, filename: string, version: number): Promise<VersionTextRow> {
    const res = await api['version-texts'].get.$post({
      json: { dirId, filename, version },
    })
    return (await successData(res)).versionText
  }

  static async upsertVersionText(body: {
    dirId: string
    filename: string
    content: string
    type?: VersionTextType
  }): Promise<VersionTextRow> {
    const res = await api['version-texts'].upsert.$post({ json: body })
    return (await successData(res)).versionText
  }

  static async publishVersionText(body: {
    dirId: string
    filename: string
    versionDesc?: string
  }): Promise<VersionTextRow> {
    const res = await api['version-texts'].publish.$post({ json: body })
    return (await successData(res)).versionText
  }

  static async deleteVersionText(id: string): Promise<void> {
    const res = await api['version-texts'][':id'].delete.$post({ param: { id } })
    await successData(res)
  }
}
