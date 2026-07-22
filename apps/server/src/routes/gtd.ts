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
  // 日常同步走 /sync/push|pull；legacy /document/* 已下线
  // saveDocument 仅保留为内部灾难修复入口，不暴露 HTTP。
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
