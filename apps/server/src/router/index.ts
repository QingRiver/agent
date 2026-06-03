import type { Hono } from 'hono'
import type { AppEnv } from '../types'
import type { RouterConfig } from './registry'
import { routerConfigs } from './routeConfig'

const METHOD_REGISTRARS: Record<
  RouterConfig['method'],
  (app: Hono<AppEnv>, path: string, handler: RouterConfig['handler']) => void
> = {
  get: (app, path, handler) => app.get(path, handler),
  post: (app, path, handler) => app.post(path, handler),
  put: (app, path, handler) => app.put(path, handler),
  delete: (app, path, handler) => app.delete(path, handler),
  patch: (app, path, handler) => app.patch(path, handler),
  options: (app, path, handler) => app.options(path, handler),
  head: (app, path, handler) => app.on('HEAD', path, handler),
  all: (app, path, handler) => app.all(path, handler),
}

export function registerRoutes(app: Hono<AppEnv>): void {
  for (const config of routerConfigs) {
    const register = METHOD_REGISTRARS[config.method]
    if (!register)
      throw new Error(`Unsupported HTTP method: ${config.method}`)
    register(app, config.path, config.handler)
  }
}
