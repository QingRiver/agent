import type { AppEnv } from '../types'
import { Hono } from 'hono'
import { conversationsRoutes } from './conversations'
import { defaultRoutes } from './default'

const apiRoutes = new Hono<AppEnv>()
  .route('/', defaultRoutes)
  .route('/conversations', conversationsRoutes)

export type AppType = typeof apiRoutes
export { apiRoutes }
