import { describe, expect, it } from 'vitest'
import { inheritMount } from './mount'

describe('inheritMount', () => {
  it('未设（undefined）→ 继承父', () => {
    expect(inheritMount('d1', undefined)).toBe('d1')
  })

  it('显式 mount 不被覆盖', () => {
    expect(inheritMount('d1', 'd2')).toBe('d2')
  })

  it('显式 null（Inbox）不被父覆盖', () => {
    expect(inheritMount('d1', null)).toBeNull()
  })

  it('父 Inbox + 未设 → Inbox', () => {
    expect(inheritMount(null, undefined)).toBeNull()
  })
})
