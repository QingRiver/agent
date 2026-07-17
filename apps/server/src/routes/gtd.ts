import type { AppEnv } from '../types'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { GtdSaveDocumentSchema } from '../../shared/gtd'
import { GtdHandlers } from '../handlers/gtd'
import { handleAppError } from '../http/errors'
import { requireAuth } from '../middleware/authMiddleware'

export const gtdRoutes = new Hono<AppEnv>()
  .onError(handleAppError)
  .use('*', requireAuth)
  .post('/document/get', c => GtdHandlers.getDocument(c, c.get('user')!))
  .post(
    '/document/save',
    zValidator('json', GtdSaveDocumentSchema),
    c => GtdHandlers.saveDocument(c, c.get('user')!, c.req.valid('json')),
  )
