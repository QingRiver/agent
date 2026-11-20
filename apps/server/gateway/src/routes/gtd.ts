import type { AppEnv } from '../types'
import { ApplyRequestSchema } from '@agent/gtd'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { applyGtdHandler, listGtdHandler } from '../handlers/gtd'
import { handleAppError } from '../http/errors'
import { requireAuth } from '../middleware/authMiddleware'

export const gtdRoutes = new Hono<AppEnv>()
  .onError(handleAppError)
  .use('*', requireAuth)
  .post('/list', c => listGtdHandler(c, c.get('user')!))
  .post(
    '/apply',
    zValidator('json', ApplyRequestSchema),
    c => applyGtdHandler(c, c.get('user')!, c.req.valid('json')),
  )
