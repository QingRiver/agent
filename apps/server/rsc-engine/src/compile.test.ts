import { describe, expect, it } from 'vitest'
import { CompileError, compileTsx, componentFromSource, MAX_SOURCE_BYTES, validateSource } from './compile'

describe('rsc-engine compile', () => {
  it('拒绝空 source', () => {
    expect(() => validateSource('  \n')).toThrow(CompileError)
  })

  it('拒绝超大 source', () => {
    const big = 'x'.repeat(MAX_SOURCE_BYTES + 1)
    expect(() => validateSource(big)).toThrow(/字节上限/)
  })

  it('拒绝 use client', () => {
    expect(() => validateSource(`'use client'\nexport default function A() { return <div /> }`)).toThrow(/use client/)
    expect(() => validateSource(`"use client";\nexport default function A() { return <div /> }`)).toThrow(/use client/)
  })

  it('合法 TSX 通过预检', async () => {
    const code = await compileTsx(`export default function Hello() { return <p>hi</p> }`)
    expect(code).toContain('createElement')
  })

  it('componentFromSource 产出可调用组件', async () => {
    const React = await import('react')
    const Comp = await componentFromSource(
      `export default function Hello() { return <p>hi</p> }`,
      React,
    )
    expect(typeof Comp).toBe('function')
  })

  it('语法错误抛 CompileError', async () => {
    await expect(compileTsx('export default function (')).rejects.toBeInstanceOf(CompileError)
  })
})
