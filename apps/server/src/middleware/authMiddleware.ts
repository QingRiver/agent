import type { AppEnv } from '../types'
import { createMiddleware } from 'hono/factory'

/** 要求已登录；session 中间件须在此之前写入 `c.get('user')` */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user'))
    return c.json({ error: 'Unauthorized' }, 401)
  await next()
})
