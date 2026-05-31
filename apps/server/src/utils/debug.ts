import { inspect } from 'node:util'
import { isPromise } from 'radash'
import { copyMethodSymbols } from './functionMeta'
import { summarizeValue } from './sanitize'
import type { SanitizeOptions } from './sanitize'

export interface DebugOptions extends SanitizeOptions {
  /**
   * 命中条件：返回 true 才会进入 Debug 分支（打印日志/可选断点）。
   * 未提供时默认 false（不进入 Debug 分支）。
   */
  when?: (this: unknown, args: unknown[]) => boolean | Promise<boolean>
  /** 是否打印入参（默认 true）。 */
  logArgs?: boolean
  /** 是否打印返回值（默认 true）。 */
  logReturn?: boolean
  /**
   * 在执行真实方法前触发 `debugger`。
   * 仅在命中 `when` 且已 attach inspector 时会真正中断。
   */
  breakpointOnEnter?: boolean
  /** 使用更深层级的 util.inspect 输出（日志可能较大，建议仅开发环境开启）。 */
  verbose?: boolean
}

function formatArg(arg: unknown, opts: DebugOptions): unknown {
  if (opts.verbose)
    return inspect(arg, { depth: 5, maxArrayLength: 20, breakLength: 120 })
  return summarizeValue(arg, opts)
}

function formatPayload(payload: unknown): string {
  return inspect(payload, {
    depth: 6,
    colors: true,
    maxArrayLength: 50,
    compact: false,
  })
}

export function Debug(options: DebugOptions = {}) {
  return function debugDecorator<This, Args extends unknown[], Return>(
    original: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method')
      return original as (this: This, ...args: Args) => Return

    const methodName = String(context.name)
    const logArgs = options.logArgs !== false
    const logReturn = options.logReturn !== false

    function debugWrapper(this: This, ...args: Args): Return {
      const className = (this as { constructor?: { name?: string } }).constructor?.name ?? 'Object'
      const label = `${className}.${methodName}`

      const resolveHit = (): boolean | Promise<boolean> => {
        if (options.when)
          return options.when.call(this, args as unknown[])
        return true
      }

      const run = (hit: boolean): Return => {
        if (!hit)
          return original.apply(this, args)

        if (options.breakpointOnEnter) {
          // eslint-disable-next-line no-debugger
          debugger
        }

        const start = Date.now()
        if (logArgs) {
          console.debug(`@Debug → ${label}\n${formatPayload({
            args: (args as unknown[]).map(a => formatArg(a, options)),
          })}`)
        }

        try {
          const out = original.apply(this, args) as Return
          if (isPromise(out)) {
            return out.then(
              (v) => {
                if (logReturn) {
                  console.debug(`@Debug ← ${label}\n${formatPayload({
                    ms: Date.now() - start,
                    return: formatArg(v, options),
                  })}`)
                }
                return v
              },
              (err: unknown) => {
                console.error(`@Debug × ${label}\n${formatPayload({
                  ms: Date.now() - start,
                  error: err instanceof Error ? err.message : String(err),
                })}`)
                throw err
              },
            ) as Return
          }

          if (logReturn) {
            console.debug(`@Debug ← ${label}\n${formatPayload({
              ms: Date.now() - start,
              return: formatArg(out, options),
            })}`)
          }
          return out
        }
        catch (err) {
          console.error(`@Debug × ${label}\n${formatPayload({
            ms: Date.now() - start,
            error: err instanceof Error ? err.message : String(err),
          })}`)
          throw err
        }
      }

      const hitOrPromise = resolveHit()
      if (isPromise(hitOrPromise))
        return hitOrPromise.then(hit => run(hit)) as Return
      return run(hitOrPromise)
    }

    copyMethodSymbols(original, debugWrapper)
    return debugWrapper as (this: This, ...args: Args) => Return
  }
}
