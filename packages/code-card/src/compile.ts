import type { ComponentType } from 'react'
import type { CardContextValue } from './card-context'
import { transform } from 'sucrase'

export class CompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompileError'
  }
}

export interface CardScope {
  React: typeof import('react')
  useState: typeof import('react').useState
  useCardContext: <T>() => CardContextValue<T>
}

function compileSource(source: string): string {
  if (!source.trim())
    throw new CompileError('代码不能为空')

  let code: string
  try {
    code = transform(source, {
      transforms: ['typescript', 'jsx', 'imports'],
      jsxRuntime: 'classic',
      production: true,
      filePath: 'Card.tsx',
    }).code
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new CompileError(`编译失败：${message}`)
  }

  if (/\brequire\s*\(/.test(code))
    throw new CompileError('不允许 import')

  return code
}

/** 在收紧的参数列表里执行卡片源码，返回 default export。 */
export function evaluateCard(source: string, scope: CardScope): ComponentType {
  const code = compileSource(source)
  const exportsObject: { default?: ComponentType } = {}
  let result: unknown
  try {
    // eslint-disable-next-line no-new-func -- 只把注入的 scope 暴露给生成代码
    const run = new Function(
      'React',
      'useState',
      'useCardContext',
      'exports',
      `${code}\nreturn exports.default`,
    ) as (
      react: CardScope['React'],
      useState: CardScope['useState'],
      useCardContext: CardScope['useCardContext'],
      exportsObject: { default?: ComponentType },
    ) => unknown
    result = run(scope.React, scope.useState, scope.useCardContext, exportsObject)
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new CompileError(`执行失败：${message}`)
  }

  if (typeof result !== 'function')
    throw new CompileError('必须 default export 一个函数组件')

  return result as ComponentType
}
