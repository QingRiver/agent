import type { AppEnv } from '../types'
import { Hono } from 'hono'
import { GraphRunNameParamSchema, GraphRunRequestSchema } from '../../shared/graphRun'
import { GraphRunHandlers } from '../handlers/graphRun'
import { requireAuth } from '../middleware/authMiddleware'
import { zValidator } from '../middleware/zodValidator'

export const graphsRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)
  .post(
    '/:name/run',
    zValidator('param', GraphRunNameParamSchema),
    zValidator('json', GraphRunRequestSchema),
    c => GraphRunHandlers.run(
      c,
      c.get('user')!,
      c.req.valid('param').name,
      c.req.valid('json'),
    ),
  )
