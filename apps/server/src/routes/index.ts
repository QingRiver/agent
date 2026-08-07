import type { AppEnv } from '../types'
import { Hono } from 'hono'
import { agentConfigRoutes } from './agentConfig'
import { conversationsRoutes } from './conversations'
import { defaultRoutes } from './default'
import { graphsRoutes } from './graphs'
import { gtdRoutes } from './gtd'
import { kbRoutes } from './kb'
import { dirRoutes, projectRoutes } from './project'
import { tagsRoutes } from './tags'

const apiRoutes = new Hono<AppEnv>()
  .route('/', defaultRoutes)
  .route('/conversations', conversationsRoutes)
  .route('/agent-configs', agentConfigRoutes)
  .route('/graphs', graphsRoutes)
  .route('/kb', kbRoutes)
  .route('/tags', tagsRoutes)
  .route('/dirs', dirRoutes)
  .route('/projects', projectRoutes)
  .route('/gtd', gtdRoutes)

export type AppType = typeof apiRoutes
export { apiRoutes }
