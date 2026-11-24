import type { AppEnv } from '../types'
import { Hono } from 'hono'
import {
  ConversationIdRequestSchema,
  CreateConversationRequestSchema,
} from '../../shared/conversation'
import {
  conversationDetail,
  createConversation,
  deleteAllConversations,
  deleteConversation,
  listConversationGraphs,
  listConversations,
  setConversationPinned,
} from '../handlers/conversations'
import { requireAuth } from '../middleware/authMiddleware'
import { zValidator } from '../middleware/zodValidator'

export const conversationsRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)
  .get('/graphs', c => listConversationGraphs(c))
  .get('/list', c => listConversations(c, c.get('user')!))
  .post(
    '/create',
    zValidator('json', CreateConversationRequestSchema),
    c => createConversation(c, c.get('user')!, c.req.valid('json')),
  )
  .get(
    '/detail',
    zValidator('query', ConversationIdRequestSchema),
    c => conversationDetail(c, c.get('user')!, c.req.valid('query')),
  )
  .post(
    '/pin',
    zValidator('json', ConversationIdRequestSchema),
    c => setConversationPinned(c, c.get('user')!, c.req.valid('json'), true),
  )
  .post(
    '/unpin',
    zValidator('json', ConversationIdRequestSchema),
    c => setConversationPinned(c, c.get('user')!, c.req.valid('json'), false),
  )
  .post(
    '/delete',
    zValidator('json', ConversationIdRequestSchema),
    c => deleteConversation(c, c.get('user')!, c.req.valid('json')),
  )
  .post('/delete-all', c => deleteAllConversations(c, c.get('user')!))
