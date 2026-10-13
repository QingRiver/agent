import type { AppEnv } from '../types'
import { Hono } from 'hono'
import { GraphStateQuerySchema, GraphStreamNameParamSchema, GraphStreamRequestSchema } from '../../shared/graphStream'
import { GraphStreamHandlers } from '../handlers/graphStream'
import { requireAuth } from '../middleware/authMiddleware'
import { zValidator } from '../middleware/zodValidator'

export const graphsRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)
  .post(
    '/:name/stream',
    zValidator('param', GraphStreamNameParamSchema),
    zValidator('json', GraphStreamRequestSchema),
    c => GraphStreamHandlers.stream(
      c,
      c.get('user')!,
      c.req.valid('param').name,
      c.req.valid('json'),
    ),
  )
  .get(
    '/:name/state',
    zValidator('param', GraphStreamNameParamSchema),
    zValidator('query', GraphStateQuerySchema),
    c => GraphStreamHandlers.state(
      c,
      c.get('user')!,
      c.req.valid('param').name,
      c.req.valid('query'),
    ),
  )
