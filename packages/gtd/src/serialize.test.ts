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

  it('parse 缺 plannedMode/plannedDate 的旧任务档默认 none/null', () => {
    const doc = makeDoc({ tasks: [makeTask({ id: 't1' })] })
    const raw = JSON.parse(serialize(doc)) as {
      tasks: Array<Record<string, unknown>>
    }
    delete raw.tasks[0]!.plannedMode
    delete raw.tasks[0]!.plannedDate
    const parsed = parse(JSON.stringify(raw))
    expect(parsed.tasks[0]?.plannedMode).toBe('none')
    expect(parsed.tasks[0]?.plannedDate).toBeNull()
  })
})

describe('migrate', () => {
  it('spec 阶段占位抛 not implemented', () => {
    expect(() => migrate(makeDoc(), '2')).toThrow('not implemented')
  })
})
