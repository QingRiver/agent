import type { AclGrants } from '@agent/project'
import type { InferResponseType } from 'hono/client'
import { api, successData } from './api-client'

type Dirs = typeof api.dirs
type Projects = typeof api.projects

/** dirs/list 返回的单行（与 server DirDto 同构） */
export type DirDto = InferResponseType<Dirs['list']['$post'], 200>['dirs'][number]
export type ProjectDto = InferResponseType<Projects['list']['$post'], 200>['projects'][number]

/**
 * dirs / projects 在线 API client。
 *
 * Phase 1：project/folder 退出 GTD sync，改走在线 Dir API（全 POST）。
 * dirs 纯内存（量小），list 拉全量扁平行，client 端 buildDirTree 组装。
 */
export class DirApi {
  /** 列出用户全部 live dirs（扁平，client 端 buildDirTree 组装） */
  static async list(): Promise<DirDto[]> {
    const res = await api.dirs.list.$post({ json: {} })
    return (await successData(res)).dirs
  }

  /** 仅列出 project 根 */
  static async listProjects(): Promise<ProjectDto[]> {
    const res = await api.projects.list.$post({ json: {} })
    return (await successData(res)).projects
  }

  /** 创建 project 根 */
  static async createProject(body: { name: string, sortOrder?: number }): Promise<DirDto> {
    const res = await api.projects.create.$post({ json: body })
    return (await successData(res)).dir
  }

  /** 创建 dir 子节点 */
  static async createDir(body: { parentId: string, name: string, sortOrder?: number }): Promise<DirDto> {
    const res = await api.dirs.create.$post({ json: body })
    return (await successData(res)).dir
  }

  static async rename(id: string, name: string): Promise<DirDto> {
    const res = await api.dirs[':id'].rename.$post({ param: { id }, json: { name } })
    return (await successData(res)).dir
  }

  static async move(id: string, body: { newParentId: string, sortOrder?: number }): Promise<DirDto> {
    const res = await api.dirs[':id'].move.$post({ param: { id }, json: body })
    return (await successData(res)).dir
  }

  static async reorder(id: string, sortOrder: number): Promise<DirDto> {
    const res = await api.dirs[':id'].reorder.$post({ param: { id }, json: { sortOrder } })
    return (await successData(res)).dir
  }

  static async updateAcl(id: string, acl: AclGrants): Promise<DirDto> {
    const res = await api.dirs[':id'].acl.$post({ param: { id }, json: { acl } })
    return (await successData(res)).dir
  }

  static async delete(id: string): Promise<void> {
    const res = await api.dirs[':id'].delete.$post({ param: { id } })
    await successData(res)
  }
}
