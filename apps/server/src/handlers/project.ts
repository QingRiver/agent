import type { Context } from 'hono'
import type { DirCreate, DirMove, DirReorder, DirRename, DirUpdateAcl, ProjectCreate } from '../../shared/project'
import type { AppEnv, AuthUser } from '../types'
import { ProjectService } from '../service/project'

/**
 * dirs / projects 在线 API handler（薄壳：取 user → 调 service → JSON）。
 *
 * 校验由 zValidator（routes）+ service（结构不变量）双拦；冲突→409、不可见→404 由
 * handleAppError 统一转。响应体 = DirDto（service 返回值本身即投影）。
 */
export class ProjectHandlers {
  static async listTree(c: Context<AppEnv>, user: AuthUser) {
    const dirs = await ProjectService.listTree(user.id)
    return c.json({ dirs })
  }

  static async listProjects(c: Context<AppEnv>, user: AuthUser) {
    const projects = await ProjectService.listProjects(user.id)
    return c.json({ projects })
  }

  static async createProject(c: Context<AppEnv>, user: AuthUser, req: ProjectCreate) {
    const dir = await ProjectService.createProject(user.id, {
      name: req.name,
      ...(req.sortOrder != null ? { sortOrder: req.sortOrder } : {}),
    })
    return c.json({ dir })
  }

  static async createDir(c: Context<AppEnv>, user: AuthUser, req: DirCreate) {
    const dir = await ProjectService.createDir(user.id, {
      parentId: req.parentId,
      name: req.name,
      ...(req.sortOrder != null ? { sortOrder: req.sortOrder } : {}),
    })
    return c.json({ dir })
  }

  static async rename(c: Context<AppEnv>, user: AuthUser, id: string, req: DirRename) {
    const dir = await ProjectService.rename(user.id, id, req.name)
    return c.json({ dir })
  }

  static async move(c: Context<AppEnv>, user: AuthUser, id: string, req: DirMove) {
    const dir = await ProjectService.move(user.id, id, {
      newParentId: req.newParentId,
      ...(req.sortOrder != null ? { sortOrder: req.sortOrder } : {}),
    })
    return c.json({ dir })
  }

  static async reorder(c: Context<AppEnv>, user: AuthUser, id: string, req: DirReorder) {
    const dir = await ProjectService.reorder(user.id, id, req.sortOrder)
    return c.json({ dir })
  }

  static async updateAcl(c: Context<AppEnv>, user: AuthUser, id: string, req: DirUpdateAcl) {
    const dir = await ProjectService.updateAcl(user.id, id, req.acl)
    return c.json({ dir })
  }

  static async delete(c: Context<AppEnv>, user: AuthUser, id: string) {
    await ProjectService.delete(user.id, id)
    return c.json({ ok: true })
  }
}
