import type { AppEnv } from '../types'
import { Hono } from 'hono'
import {
  SkillCreateSchema,
  SkillIdParamSchema,
  SkillSetTagsSchema,
  VersionTextIdParamSchema,
  VersionTextListAllSchema,
  VersionTextListSchema,
  VersionTextUpsertSchema,
} from '../../shared/skill'
import { SkillHandlers } from '../handlers/skill'
import { handleAppError } from '../http/errors'
import { requireAuth } from '../middleware/authMiddleware'
import { zValidator } from '../middleware/zodValidator'

export const skillRoutes = new Hono<AppEnv>()
  .onError(handleAppError)
  .use('*', requireAuth)
  .post('/list', c => SkillHandlers.list(c, c.get('user')!))
  .post('/create', zValidator('json', SkillCreateSchema), c =>
    SkillHandlers.create(c, c.get('user')!, c.req.valid('json')))
  .post(
    '/:id/unmark',
    zValidator('param', SkillIdParamSchema),
    c => SkillHandlers.unmark(c, c.get('user')!, c.req.valid('param').id),
  )
  .post(
    '/:id/tags',
    zValidator('param', SkillIdParamSchema),
    zValidator('json', SkillSetTagsSchema),
    c => SkillHandlers.setTags(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )

export const versionTextRoutes = new Hono<AppEnv>()
  .onError(handleAppError)
  .use('*', requireAuth)
  .post('/list', zValidator('json', VersionTextListSchema), c =>
    SkillHandlers.listVersionTexts(c, c.get('user')!, c.req.valid('json').dirId))
  .post('/list-all', zValidator('json', VersionTextListAllSchema), c =>
    SkillHandlers.listAllVersionTexts(c, c.get('user')!))
  .post('/upsert', zValidator('json', VersionTextUpsertSchema), c =>
    SkillHandlers.upsertVersionText(c, c.get('user')!, c.req.valid('json')))
  .post(
    '/:id/delete',
    zValidator('param', VersionTextIdParamSchema),
    c => SkillHandlers.deleteVersionText(c, c.get('user')!, c.req.valid('param').id),
  )
