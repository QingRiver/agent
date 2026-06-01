import type { HttpMethod } from '@koa/router'
import type { Middleware } from 'koa'
import type { RouterConfig } from './registry'
import Router from '@koa/router'
import { get, isFunction } from 'radash'
import { routerConfigs } from './routeConfig'

function registerRoute(router: Router, config: RouterConfig): void {
  const method = config.method.toLowerCase() as HttpMethod
  const register = get(router, method)
  if (!isFunction(register))
    throw new Error(`Unsupported HTTP method: ${config.method}`)

  register.call(router, config.path, config.handler)
}

function createRouter(): Router {
  const router = new Router({ exclusive: 'specificity' })

  for (const config of routerConfigs)
    registerRoute(router, config)

  return router
}

const koaRouter = createRouter()
const routes = koaRouter.routes() as Middleware
const allowedMethods = koaRouter.allowedMethods() as Middleware

export const router: Middleware = async (ctx, next) => {
  await routes(ctx, async () => {
    await allowedMethods(ctx, next)
  })
}
