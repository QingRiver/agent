import type { AppEnv } from '../types'
import { PullRequestSchema, PushRequestSchema } from '@agent/gtd'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { TrashPurgeSchema } from '../../shared/gtd-trash'
import { GtdSyncHandlers } from '../handlers/gtd-sync'
import { GtdTrashHandlers } from '../handlers/gtd-trash'
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
  /** 回收站永久删除：在线权威，旁路 outbox */
  .post(
    '/trash/purge',
    zValidator('json', TrashPurgeSchema),
    c => GtdTrashHandlers.purge(c, c.get('user')!, c.req.valid('json')),
  )
