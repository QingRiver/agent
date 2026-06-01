import type { HttpMethod } from '@koa/router'

/** Class-level prefix from `@Controller` */
export const PREFIX_SYM = Symbol.for('controllerPrefix')

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

export function Route(method: HttpMethod, subPath: string) {
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): void {
    ;(target as any)[ROUTE_META_SYM] = {
      method,
      subPath,
      propertyKey: context.name,
    } as RouteMeta
  }
}

export const Get = (subPath: string) => Route('get', subPath)
export const Post = (subPath: string) => Route('post', subPath)
