import type { z } from 'zod'

export type HttpMethod = 'get' | 'post'

/** Class-level prefix from `@Controller` */
export const PREFIX_SYM = Symbol.for('controllerPrefix')

/** Class / method：handler 执行前校验登录，并将 `AuthUser` 作为第二参数注入 */
export const AUTH_REQUIRED_SYM = Symbol.for('authRequired')

/** Method：handler 执行前校验请求，并将解析结果作为后续参数注入 */
export const REQUEST_SCHEMA_SYM = Symbol.for('requestSchema')

export type RequestSource = 'query' | 'body'

export interface RequestSchemaMeta {
  schema: z.ZodTypeAny
  source: RequestSource
}

/** Method-level route meta from `Route` / `Get` / `Post` */
export const ROUTE_META_SYM = Symbol.for('routeMeta')

export interface RouteMeta {
  method: HttpMethod
  subPath: string
  propertyKey: string | symbol
}

export function joinPath(prefix: string, subPath: string): string {
  const p = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
  if (!subPath || subPath === '/')
    return p || '/'
  const s = subPath.startsWith('/') ? subPath : `/${subPath}`
  return `${p}${s}`
}

export function Controller(prefix: string) {
  return function <T extends new (...args: any[]) => any>(
    target: T,
    _context: ClassDecoratorContext<T>,
  ): void {
    ;(target as any)[PREFIX_SYM] = prefix
  }
}

function appendRouteMeta(
  target: object,
  meta: RouteMeta,
): void {
  const existing = (target as any)[ROUTE_META_SYM] as RouteMeta | RouteMeta[] | undefined
  if (existing == null) {
    ;(target as any)[ROUTE_META_SYM] = meta
    return
  }
  const list = Array.isArray(existing) ? existing : [existing]
  list.push(meta)
  ;(target as any)[ROUTE_META_SYM] = list
}

export function Route(method: HttpMethod, subPath: string) {
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): void {
    appendRouteMeta(target, {
      method,
      subPath,
      propertyKey: context.name,
    })
  }
}

export const Get = (subPath: string) => Route('get', subPath)
export const Post = (subPath: string) => Route('post', subPath)

/**
 * 要求登录：可标在 class（全部路由）或 method（单条路由）。
 * registry 校验后向 handler 注入第二参数 `AuthUser`。
 *
 * @example
 * @AuthRequired()
 * class Api { ... }
 *
 * @example
 * class Api {
 *   @AuthRequired()
 *   @Get('/me')
 *   me(c, user) { ... }
 * }
 */
export function AuthRequired() {
  return function <This, Args extends unknown[], Return>(
    target: ((this: This, ...args: Args) => Return) | (new (...args: Args) => This),
    context: ClassDecoratorContext | ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): void {
    if (context.kind === 'class' || context.kind === 'method') {
      ;(target as any)[AUTH_REQUIRED_SYM] = true
    }
  }
}

/**
 * 校验请求参数并在 handler 中注入解析结果（在 `AuthUser` 之后）。
 * registry 负责提前返回 400；进入 handler 时可直接使用已校验类型。
 *
 * @example
 * @Get('/detail')
 * @RequestSchema(ConversationIdRequestSchema, 'query')
 * detail(c, user, req: ConversationIdRequest) { ... }
 *
 * @example
 * @Post('/create')
 * @RequestSchema(CreateConversationRequestSchema, 'body')
 * create(c, user, req: CreateConversationRequest) { ... }
 */
export function RequestSchema(schema: z.ZodTypeAny, source: RequestSource) {
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): void {
    if (context.kind === 'method') {
      ;(target as any)[REQUEST_SCHEMA_SYM] = { schema, source } satisfies RequestSchemaMeta
    }
  }
}
