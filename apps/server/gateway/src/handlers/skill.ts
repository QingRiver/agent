import type { Context } from 'hono'
import type { SkillCreate, SkillSetTags, VersionTextUpsert } from '../../shared/skill'
import type { AppEnv, AuthUser } from '../types'
import { SkillService } from '../service/skill'
import { TagsService } from '../service/tags'

export class SkillHandlers {
  static async list(c: Context<AppEnv>, user: AuthUser) {
    const skills = await SkillService.list(user.id)
    return c.json({ skills })
  }

  static async create(c: Context<AppEnv>, user: AuthUser, req: SkillCreate) {
    const skill = await SkillService.create(user.id, {
      dirId: req.dirId,
      ...(req.code != null ? { code: req.code } : {}),
    })
    return c.json({ skill })
  }

  static async unmark(c: Context<AppEnv>, user: AuthUser, id: string) {
    await SkillService.unmark(user.id, id)
    return c.json({ ok: true })
  }

  static async setTags(c: Context<AppEnv>, user: AuthUser, id: string, req: SkillSetTags) {
    await TagsService.setSkillTagIds(id, user.id, req.tagIds)
    const skills = await SkillService.list(user.id)
    const skill = skills.find(s => s.id === id)
    if (!skill)
      throw new Error('skill 不存在或不可见')
    return c.json({ skill })
  }

  static async listAllVersionTexts(c: Context<AppEnv>, user: AuthUser) {
    const versionTexts = await SkillService.listAllVersionTexts(user.id)
    return c.json({ versionTexts })
  }

  static async listVersionTexts(c: Context<AppEnv>, user: AuthUser, dirId: string) {
    const versionTexts = await SkillService.listVersionTexts(user.id, dirId)
    return c.json({ versionTexts })
  }

  static async upsertVersionText(c: Context<AppEnv>, user: AuthUser, req: VersionTextUpsert) {
    const versionText = await SkillService.upsertVersionText(user.id, req)
    return c.json({ versionText })
  }

  static async deleteVersionText(c: Context<AppEnv>, user: AuthUser, id: string) {
    await SkillService.deleteVersionText(user.id, id)
    return c.json({ ok: true })
  }
}
