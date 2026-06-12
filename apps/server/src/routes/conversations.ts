import type { AppEnv } from '../types'
import { Hono } from 'hono'
import {
  ConversationIdRequestSchema,
  CreateConversationRequestSchema,
} from '../../shared/conversation'
import { ConversationHandlers } from '../handlers/conversations'
import { requireAuth } from '../middleware/authMiddleware'
import { zValidator } from '../middleware/zodValidator'

export const conversationsRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)
  .get('/graphs', c => ConversationHandlers.graphs(c))
  .get('/list', c => ConversationHandlers.list(c, c.get('user')!))
  .post(
    '/create',
    zValidator('json', CreateConversationRequestSchema),
    c => ConversationHandlers.create(c, c.get('user')!, c.req.valid('json')),
  )
  .get(
    '/detail',
    zValidator('query', ConversationIdRequestSchema),
    c => ConversationHandlers.detail(c, c.get('user')!, c.req.valid('query')),
  )
  .get(
    '/messages',
    zValidator('query', ConversationIdRequestSchema),
    c => ConversationHandlers.messages(c, c.get('user')!, c.req.valid('query')),
  )
  .post(
    '/pin',
    zValidator('json', ConversationIdRequestSchema),
    c => ConversationHandlers.pin(c, c.get('user')!, c.req.valid('json')),
  )
  .post(
    '/unpin',
    zValidator('json', ConversationIdRequestSchema),
    c => ConversationHandlers.unpin(c, c.get('user')!, c.req.valid('json')),
  )
  .post(
    '/delete',
    zValidator('json', ConversationIdRequestSchema),
    c => ConversationHandlers.remove(c, c.get('user')!, c.req.valid('json')),
  )
