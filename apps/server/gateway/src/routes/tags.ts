import type { AppEnv } from '../types'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  TagIdParamSchema,
  TagsCreateSchema,
  TagsDeleteSchema,
  TagsListRequestSchema,
  TagsRenameSchema,
  TagsUpdateColorSchema,
} from '../../shared/tags'
import { TagsHandlers } from '../handlers/tags'
import { handleAppError } from '../http/errors'
import { requireAuth } from '../middleware/authMiddleware'

export const tagsRoutes = new Hono<AppEnv>()
  .onError(handleAppError)
  .use('*', requireAuth)
  .post('/list', zValidator('json', TagsListRequestSchema), c => TagsHandlers.list(c, c.get('user')!))
  .post('/create', zValidator('json', TagsCreateSchema), c => TagsHandlers.create(c, c.get('user')!, c.req.valid('json')))
  .post(
    '/:id/rename',
    zValidator('param', TagIdParamSchema),
    zValidator('json', TagsRenameSchema),
    c => TagsHandlers.rename(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )
  .post(
    '/:id/delete',
    zValidator('param', TagIdParamSchema),
    zValidator('json', TagsDeleteSchema),
    c => TagsHandlers.deleteTag(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )
  .post(
    '/:id/update-color',
    zValidator('param', TagIdParamSchema),
    zValidator('json', TagsUpdateColorSchema),
    c => TagsHandlers.updateColor(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )
