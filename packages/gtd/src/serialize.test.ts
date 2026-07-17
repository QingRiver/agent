import { describe, expect, it } from 'vitest'
import { makeDoc, makeTask } from './__tests__/fixtures'
import { migrate, parse, serialize } from './serialize'

describe('serialize / parse', () => {
  it('round-trip 无损', () => {
    const doc = makeDoc({ tasks: [makeTask({ id: 't1' })] })
    expect(parse(serialize(doc))).toEqual(doc)
  })

  it('parse 非法 JSON 抛错', () => {
    expect(() => parse('{invalid')).toThrow()
  })

  it('parse 不合规 doc 抛错', () => {
    expect(() => parse(JSON.stringify({ version: '1.0.0' }))).toThrow()
  })
})

describe('migrate', () => {
  it('spec 阶段占位抛 not implemented', () => {
    expect(() => migrate(makeDoc(), '2')).toThrow('not implemented')
  })
})
