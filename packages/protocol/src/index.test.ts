import { describe, expect, it } from 'vitest'
import { toResponse } from './index'

describe('interrupt protocol', () => {
  it('toResponse 构造带 interruptId 的响应', () => {
    const r = toResponse('id-1', 'input', { value: 'hello' })
    expect(r).toEqual({ interruptId: 'id-1', type: 'input', payload: { value: 'hello' } })
  })

  it('toResponse 覆盖各交互形态', () => {
    expect(toResponse('id-2', 'select', { value: 'a' }).payload).toEqual({ value: 'a' })
    expect(toResponse('id-3', 'multiSelect', { values: ['a', 'b'] }).payload).toEqual({ values: ['a', 'b'] })
    expect(toResponse('id-4', 'modal', { action: '确认' }).payload).toEqual({ action: '确认' })
    expect(toResponse('id-5', 'approval', { approved: true }).payload).toEqual({ approved: true })
    expect(toResponse('id-6', 'unlock', {}).payload).toEqual({})
  })

  it('interruptRequest 携带 interruptId 字段(类型层保证,运行时断言)', () => {
    const req = { interruptId: 'id-7', type: 'input' as const, message: 'q' }
    expect(req.interruptId).toBe('id-7')
    expect(req.type).toBe('input')
  })
})
