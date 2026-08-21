import type { Context } from 'hono'
import type {
  TagsCreate,
  TagsDelete,
  TagsRename,
  TagsUpdateColor,
} from '../../shared/tags'
import type { AppEnv, AuthUser } from '../types'
import { notFound } from '../http/errors'
import { TagsService } from '../service/tags'

export class TagsHandlers {
  static async list(c: Context<AppEnv>, user: AuthUser) {
    const tags = await TagsService.list(user.id)
    return c.json({ tags })
  }

  static async create(c: Context<AppEnv>, user: AuthUser, req: TagsCreate) {
    const tag = await TagsService.create(user.id, {
      name: req.name,
      ...(req.color != null ? { color: req.color } : {}),
    })
    return c.json({ tag })
  }

  static async rename(c: Context<AppEnv>, user: AuthUser, id: string, req: TagsRename) {
    const result = await TagsService.rename(id, user.id, req.name)
    if (!result)
      notFound()
    return c.json(result)
  }

  static async deleteTag(c: Context<AppEnv>, user: AuthUser, id: string, req: TagsDelete) {
    const result = await TagsService.deleteTag(id, user.id, {
      mode: req.mode,
      ...(req.dryRun != null ? { dryRun: req.dryRun } : {}),
      ...(req.docIds != null ? { docIds: req.docIds } : {}),
      ...(req.taskIds != null ? { taskIds: req.taskIds } : {}),
    })
    if (!result)
      notFound()
    return c.json(result)
  }

  static async updateColor(
    c: Context<AppEnv>,
    user: AuthUser,
    id: string,
    req: TagsUpdateColor,
  ) {
    const tag = await TagsService.updateColor(id, user.id, req.color)
    if (!tag)
      notFound()
    return c.json({ tag })
  }
}
