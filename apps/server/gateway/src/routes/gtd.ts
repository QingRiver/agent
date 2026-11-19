import type { AppEnv } from '../types'
import { SyncRequestSchema } from '@agent/gtd'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { syncGtdHandler } from '../handlers/gtd-sync'
import { handleAppError } from '../http/errors'
import { requireAuth } from '../middleware/authMiddleware'

export const gtdRoutes = new Hono<AppEnv>()
  .onError(handleAppError)
  .use('*', requireAuth)
  // 唯一入口：上传本机未确认事务 + 拉取服务器新事务（或快照）。导入导出在 client 侧完成。
  .post(
    '/sync',
    zValidator('json', SyncRequestSchema),
    c => syncGtdHandler(c, c.get('user')!, c.req.valid('json')),
  )
