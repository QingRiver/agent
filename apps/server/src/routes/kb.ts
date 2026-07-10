import type { AppEnv } from '../types'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { KbIngestPathRequestSchema, KbQueryRequestSchema } from '../../shared/kb'
import { KbHandlers } from '../handlers/kb'
import { requireAuth } from '../middleware/authMiddleware'

export const kbRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)
  .post('/ingest', c => KbHandlers.ingest(c))
  .post(
    '/ingest/path',
    zValidator('json', KbIngestPathRequestSchema),
    c => KbHandlers.ingestPath(c, c.req.valid('json')),
  )
  .post(
    '/query',
    zValidator('json', KbQueryRequestSchema),
    c => KbHandlers.query(c, c.req.valid('json')),
  )
  .get('/manage', c => KbHandlers.manage(c))
