import type { AppEnv } from '../types'
import { Hono } from 'hono'
import { conversationsRoutes } from './conversations'
import { defaultRoutes } from './default'
import { gtdRoutes } from './gtd'
import { kbRoutes } from './kb'
import { tagsRoutes } from './tags'

const apiRoutes = new Hono<AppEnv>()
  .route('/', defaultRoutes)
  .route('/conversations', conversationsRoutes)
  .route('/kb', kbRoutes)
  .route('/tags', tagsRoutes)
  .route('/gtd', gtdRoutes)

export type AppType = typeof apiRoutes
export { apiRoutes }
