/**
 * 动态 TSX 校验 + esbuild 编译。
 * 运行时在 Waku RSC 环境内用同一 React 实例 eval（避免 Vite 动态 import 缓存 / 双 React）。
 */
import type { ComponentType } from 'react'
import { Buffer } from 'node:buffer'
import * as esbuild from 'esbuild'

export const MAX_SOURCE_BYTES = 32 * 1024

export class CompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompileError'
  }
}

/** 校验源码：空串、体积、禁 'use client' */
export function validateSource(source: string): void {
  if (!source.trim())
    throw new CompileError('source 不能为空')
  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES)
    throw new CompileError(`source 超过 ${MAX_SOURCE_BYTES} 字节上限`)
  if (/(?:^|\n)\s*['"]use client['"]\s*;?/.test(source))
    throw new CompileError('本轮不支持 \'use client\'（web 无 client module map）')
}

/**
 * esbuild 预检：能编过才进入 eval。
 * 产出不直接 Node import（会拿到另一份 React）。
 */
export async function compileTsx(source: string): Promise<string> {
  validateSource(source)
  try {
    const result = await esbuild.transform(source, {
      loader: 'tsx',
      jsx: 'transform',
      format: 'cjs',
      target: 'es2022',
    })
    return result.code
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new CompileError(`esbuild 编译失败：${msg}`)
  }
}

/**
 * 在调用方提供的 React 下执行 CJS 编译产物，返回 default export 组件。
 * React 必须来自 Waku RSC 图（与 renderRsc 同一实例）。
 */
export async function componentFromSource(
  source: string,
  React: typeof import('react'),
): Promise<ComponentType> {
  const code = await compileTsx(source)
  const module = { exports: {} as { default?: ComponentType } }
  const exports = module.exports
  // eslint-disable-next-line no-new-func -- 故意在受控 RSC 进程内 eval 用户 TSX
  const run = new Function('React', 'exports', 'module', `${code}\n;return module.exports;`)
  const result = run(React, exports, module) as { default?: ComponentType }
  const Comp = result?.default ?? module.exports.default
  if (typeof Comp !== 'function')
    throw new CompileError('TSX 必须 default export 一个组件函数')
  return Comp
}
