import type { AppEnv } from '../types'
import { Hono } from 'hono'
import { conversationsRoutes } from './conversations'
import { defaultRoutes } from './default'
import { kbRoutes } from './kb'

const apiRoutes = new Hono<AppEnv>()
  .route('/', defaultRoutes)
  .route('/conversations', conversationsRoutes)
  .route('/kb', kbRoutes)

export type AppType = typeof apiRoutes
export { apiRoutes }
