import type { AppEnv } from '../types'
import { PullRequestSchema, PushRequestSchema } from '@agent/gtd'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { GtdSyncHandlers } from '../handlers/gtd-sync'
import { handleAppError } from '../http/errors'
import { requireAuth } from '../middleware/authMiddleware'

export const gtdRoutes = new Hono<AppEnv>()
  .onError(handleAppError)
  .use('*', requireAuth)
  // 日常同步走 /sync/push|pull；导入导出为 client 侧行级 JSON（v2.0.0），无 /document 路由。
  .post(
    '/sync/push',
    zValidator('json', PushRequestSchema),
    c => GtdSyncHandlers.push(c, c.get('user')!, c.req.valid('json')),
  )
  .post(
    '/sync/pull',
    zValidator('json', PullRequestSchema),
    c => GtdSyncHandlers.pull(c, c.get('user')!, c.req.valid('json')),
  )
