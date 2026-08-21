import type { AppEnv } from '../types'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  DirCreateSchema,
  DirIdParamSchema,
  DirMoveSchema,
  DirRenameSchema,
  DirReorderSchema,
  DirUpdateAclSchema,
  ProjectCreateSchema,
} from '../../shared/project'
import { ProjectHandlers } from '../handlers/project'
import { handleAppError } from '../http/errors'
import { requireAuth } from '../middleware/authMiddleware'

/**
 * dirs / projects 在线路由。
 *
 * 全 POST + /:id/<action>（与 tags 一致，规避 GET 缓存 + REST 风格约定）。
 * /dirs 承载 dir 子节点 + 通用动作（rename/move/acl/delete）+ list 全树；
 * /projects 仅 create + list（project=根，不可 move/rename-acl 区别仅语义）。
 */
export const dirRoutes = new Hono<AppEnv>()
  .onError(handleAppError)
  .use('*', requireAuth)
  .post('/list', c => ProjectHandlers.listTree(c, c.get('user')!))
  .post('/create', zValidator('json', DirCreateSchema), c =>
    ProjectHandlers.createDir(c, c.get('user')!, c.req.valid('json')))
  .post(
    '/:id/rename',
    zValidator('param', DirIdParamSchema),
    zValidator('json', DirRenameSchema),
    c => ProjectHandlers.rename(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )
  .post(
    '/:id/move',
    zValidator('param', DirIdParamSchema),
    zValidator('json', DirMoveSchema),
    c => ProjectHandlers.move(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )
  .post(
    '/:id/reorder',
    zValidator('param', DirIdParamSchema),
    zValidator('json', DirReorderSchema),
    c => ProjectHandlers.reorder(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )
  .post(
    '/:id/acl',
    zValidator('param', DirIdParamSchema),
    zValidator('json', DirUpdateAclSchema),
    c => ProjectHandlers.updateAcl(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )
  .post(
    '/:id/delete',
    zValidator('param', DirIdParamSchema),
    c => ProjectHandlers.delete(c, c.get('user')!, c.req.valid('param').id),
  )

export const projectRoutes = new Hono<AppEnv>()
  .onError(handleAppError)
  .use('*', requireAuth)
  .post('/list', c => ProjectHandlers.listProjects(c, c.get('user')!))
  .post('/create', zValidator('json', ProjectCreateSchema), c =>
    ProjectHandlers.createProject(c, c.get('user')!, c.req.valid('json')))
