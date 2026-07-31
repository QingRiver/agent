import type { AppEnv } from '../types'
import { Hono } from 'hono'
import {
  AgentConfigIdQuerySchema,
  UpsertAgentConfigRequestSchema,
} from '../../shared/agentConfig'
import { AgentConfigHandlers } from '../handlers/agentConfig'
import { requireAuth } from '../middleware/authMiddleware'
import { zValidator } from '../middleware/zodValidator'

export const agentConfigRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)
  .post(
    '/upsert',
    zValidator('json', UpsertAgentConfigRequestSchema),
    c => AgentConfigHandlers.upsert(c, c.get('user')!, c.req.valid('json')),
  )
  .get(
    '/get',
    zValidator('query', AgentConfigIdQuerySchema),
    c => AgentConfigHandlers.get(c, c.get('user')!, c.req.valid('query')),
  )
