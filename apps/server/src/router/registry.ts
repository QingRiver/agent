import type { Context } from 'hono'
import type { AppEnv, AuthUser } from '../types'
import type { RequestSchemaMeta, RouteMeta } from './decorator'
import { flat, isFunction } from 'radash'
import { getRequiredUser } from '../middleware/requireAuth'
import {
  AUTH_REQUIRED_SYM,
  joinPath,
  PREFIX_SYM,
  REQUEST_SCHEMA_SYM,
  ROUTE_META_SYM,
} from './decorator'
import { parseValidatedRequest } from './parseRequest'

export type HttpMethod = RouteMeta['method']

export interface RouterConfig {
  method: HttpMethod
  path: string
  handler: (c: Context<AppEnv>) => Promise<Response>
}

const singletons = new WeakMap<new (...args: any[]) => any, any>()

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

    const rawMeta = (fn as any)[ROUTE_META_SYM] as RouteMeta | RouteMeta[] | undefined
    if (!rawMeta)
      continue

    const metas = Array.isArray(rawMeta) ? rawMeta : [rawMeta]
    for (const meta of metas) {
      const path = joinPath(prefix, meta.subPath)
      const authRequired = (Ctor as any)[AUTH_REQUIRED_SYM] === true
        || (fn as any)[AUTH_REQUIRED_SYM] === true

      const requestSchema = (fn as any)[REQUEST_SCHEMA_SYM] as RequestSchemaMeta | undefined

      routes.push({
        method: meta.method,
        path,
        handler: async (c: Context<AppEnv>) => {
          const handler = (inst as any)[meta.propertyKey] as
            | ((ctx: Context<AppEnv>, user: AuthUser, req: unknown) => Promise<Response> | Response)
            | ((ctx: Context<AppEnv>, req: unknown) => Promise<Response> | Response)
            | ((ctx: Context<AppEnv>, user: AuthUser) => Promise<Response> | Response)
            | ((ctx: Context<AppEnv>) => Promise<Response> | Response)
            | undefined
          if (!handler)
            return c.notFound()

          let validated: unknown | undefined
          if (requestSchema) {
            const parsed = await parseValidatedRequest(c, requestSchema)
            if (parsed instanceof Response)
              return parsed
            validated = parsed
          }

          if (authRequired) {
            const user = getRequiredUser(c)
            if (user instanceof Response)
              return user
            if (requestSchema) {
              return (handler as (ctx: Context<AppEnv>, user: AuthUser, req: unknown) => Promise<Response> | Response)
                .call(inst, c, user, validated)
            }
            return (handler as (ctx: Context<AppEnv>, user: AuthUser) => Promise<Response> | Response)
              .call(inst, c, user)
          }
          if (requestSchema) {
            return (handler as (ctx: Context<AppEnv>, req: unknown) => Promise<Response> | Response)
              .call(inst, c, validated)
          }
          return (handler as (ctx: Context<AppEnv>) => Promise<Response> | Response).call(inst, c)
        },
      })
    }
  }

  return routes
}

export function collectRoutesFromControllers(
  ctors: Array<new (...args: any[]) => any>,
): RouterConfig[] {
  return sortRoutesForRegistration(flat(ctors.map(collectRoutesFromController)))
}
