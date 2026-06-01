import type { HttpMethod } from '@koa/router'
import type { Context, Next } from 'koa'
import type { RouteMeta } from './decorator'
import { flat, isFunction } from 'radash'
import { joinPath, PREFIX_SYM, ROUTE_META_SYM } from './decorator'

export interface RouterConfig {
  method: HttpMethod
  path: string
  handler: (ctx: Context, next: Next) => Promise<void>
}

const singletons = new WeakMap<new (...args: any[]) => any, any>()

/**
 * 控制器单例缓存：
 * - 每个 Controller 类只实例化一次；
 * - 避免在每次请求时重复 new，保持与传统「类单例控制器」一致的语义。
 */
function getSingleton<C extends new (...args: any[]) => any>(
  Ctor: C,
): InstanceType<C> {
  let inst = singletons.get(Ctor)
  if (!inst) {
    inst = new Ctor()
    singletons.set(Ctor, inst)
  }
  return inst as InstanceType<C>
}

function hasPathParam(path: string): boolean {
  return /\/:[^/]+/.test(path)
}

/**
 * 注册顺序策略（非常关键）：
 * - 先注册静态路由，如 `/api/hello`、`/api/sse`；
 * - 后注册参数路由，如 `/api/:param`；
 * - 同类型内部按路径长度倒序，尽量让更具体的路由优先。
 *
 * 这样可避免 `/:param` 过早吞掉本应命中的静态路由。
 */
function sortRoutesForRegistration(routes: RouterConfig[]): RouterConfig[] {
  return [...routes].sort((a, b) => {
    const ap = hasPathParam(a.path) ? 1 : 0
    const bp = hasPathParam(b.path) ? 1 : 0
    if (ap !== bp)
      return ap - bp
    return b.path.length - a.path.length
  })
}

function collectRoutesFromController(
  Ctor: new (...args: any[]) => any,
): RouterConfig[] {
  const prefix = (Ctor as any)[PREFIX_SYM] as string | undefined
  if (prefix == null)
    throw new Error(`Missing @Controller on ${Ctor.name}`)

  const inst = getSingleton(Ctor)
  const proto = Ctor.prototype as object
  const routes: RouterConfig[] = []

  for (const key of Reflect.ownKeys(proto)) {
    if (key === 'constructor')
      continue
    const fn = Object.getOwnPropertyDescriptor(proto, key)?.value
    if (!isFunction(fn))
      continue

    const meta = (fn as any)[ROUTE_META_SYM] as RouteMeta | undefined
    if (!meta)
      continue

    const path = joinPath(prefix, meta.subPath)
    routes.push({
      method: meta.method,
      path,
      handler: async (ctx: Context, next: Next) => {
        const handler = (inst as any)[meta.propertyKey] as
          | ((c: Context, n: Next) => Promise<void>)
          | undefined
        if (!handler)
          return next()
        return handler.call(inst, ctx, next)
      },
    })
  }

  return routes
}

export function collectRoutesFromControllers(
  ctors: Array<new (...args: any[]) => any>,
): RouterConfig[] {
  return sortRoutesForRegistration(flat(ctors.map(collectRoutesFromController)))
}
